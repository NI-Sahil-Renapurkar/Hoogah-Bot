import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';
import axios from 'axios';

// Initialize app on first import
let appInitialized = false;

async function initializeApp() {
  if (!appInitialized) {
    // Don't call app.start() in serverless - just initialize
    // The app should already have handlers registered from src/app.ts
    console.log('Initializing app, router exists:', !!(app as any).router);
    appInitialized = true;
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Log immediately - even before method check
  console.log(`[${new Date().toISOString()}] ${req.method} /api/messages`);
  
  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ACK immediately (Bot Framework requirement) - BEFORE processing
  res.status(200).send('OK');

  const teamsApp = await initializeApp();
  
  // Get the activity from request body
  const activity = req.body;
  if (!activity) {
    console.error('No activity in request body');
    return;
  }

  // Log incoming activity details for debugging
  console.log('Incoming activity - recipient.id:', activity.recipient?.id);
  console.log('Incoming activity - channelId:', activity.channelId);
  console.log('Incoming activity - serviceUrl:', activity.serviceUrl);
  console.log('Incoming activity - text:', activity.text);

  // Process in background (async)
  void (async () => {
    try {
      const clientId = process.env.CLIENT_ID || process.env.BOT_ID || '';
      const clientSecret = process.env.CLIENT_SECRET || process.env.BOT_PASSWORD || process.env.CLIENT_PASSWORD || process.env.SECRET_BOT_PASSWORD || '';

      // Create context with send function
      const context: any = {
        activity,
        send: async (response: any) => {
          console.log('📤 context.send() called!');
          console.log('Response type:', response.type);
          console.log('Response attachments:', response.attachments?.length || 0);
          try {
            if (!clientId || !clientSecret) {
              throw new Error('CLIENT_ID and CLIENT_SECRET must be set');
            }
            
            // Extract tenantId from activity
            const tenantId = activity.channelData?.tenant?.id || process.env.MS_TENANT_ID;
            if (!tenantId) {
              throw new Error('Tenant ID not found in activity.channelData.tenant.id and MS_TENANT_ID not set');
            }
            console.log('Using tenantId:', tenantId);
            
            // Get Bot Framework token for this tenant
            console.log('About to call getBotFrameworkToken...');
            const token = await getBotFrameworkToken(clientId, clientSecret, tenantId);
            console.log('Token obtained successfully, length:', token.length);
            
            // Build response activity
            const responseActivity = {
              type: "message",
              conversation: activity.conversation,
              from: activity.recipient,
              recipient: activity.from,
              ...response,
            };
            
            // Send to Bot Framework Connector
            await sendToConversation(activity, token, responseActivity);
            console.log('✅ Response sent successfully');
          } catch (error: any) {
            console.error('❌ Send error:', error.message);
            if (error.response) {
              console.error('Status:', error.response.status);
              console.error('WWW-Authenticate:', error.response.headers?.["www-authenticate"]);
              console.error('Data:', JSON.stringify(error.response.data, null, 2));
            }
            console.error('Error stack:', error.stack);
          }
        },
      };

      // Trigger app.on("message") handlers via router
      const router = (teamsApp as any).router;
      console.log('Router exists:', !!router);
      console.log('Activity type:', activity.type);
      console.log('Activity text:', activity.text);
      
      let handlerCalled = false;
      
      // Try router.select() first
      if (router && typeof router.select === 'function') {
        const routes = router.select(activity);
        console.log('Routes selected:', routes.length);
        
        if (routes.length > 0) {
          for (const route of routes) {
            console.log('Calling route handler via router.select()');
            await route(context);
            handlerCalled = true;
          }
        } else {
          console.warn('No routes selected for activity type:', activity.type);
        }
      }
      
      // Fallback: try to call handlers directly from router.routes
      if (!handlerCalled && router && router.routes) {
        console.log('Trying fallback: router.routes, total routes:', router.routes.length);
        const messageRoute = router.routes.find((r: any) => r.name === "message");
        if (messageRoute) {
          console.log('Found message route');
          const handlers = messageRoute.handlers || messageRoute._handlers || messageRoute.callbacks || [];
          console.log('Found handlers:', handlers.length);
          for (const handler of handlers) {
            try {
              console.log('Calling handler directly');
              await handler(context);
              handlerCalled = true;
            } catch (e: any) {
              console.error("Handler error:", e.message);
              console.error("Handler error stack:", e.stack);
            }
          }
        } else {
          console.warn('Message route not found in router.routes');
          console.log('Available routes:', router.routes.map((r: any) => r.name || 'unnamed'));
        }
      }
      
      if (!handlerCalled) {
        console.error('⚠️ No handlers were called! Router might not be properly initialized.');
        console.log('Router object keys:', router ? Object.keys(router) : 'router is null');
      } else {
        console.log('✅ Handler was called successfully');
      }
    } catch (error: any) {
      console.error('Error processing activity:', error);
      console.error('Error stack:', error.stack);
    }
  })();
}

// Helper function to decode JWT payload
function decodeJwtPayload(token: string): any | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const b64url = parts[1];
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const json = Buffer.from(b64, "base64").toString("utf8");
  return JSON.parse(json);
}

// Token cache per tenant
type TokenCacheEntry = { token: string; expMs: number };
const tokenCacheByTenant = new Map<string, TokenCacheEntry>();

// Helper function to get Bot Framework token
async function getBotFrameworkToken(clientId: string, clientSecret: string, tenantId: string): Promise<string> {
  // Check cache first
  const now = Date.now();
  const cached = tokenCacheByTenant.get(tenantId);
  if (cached && now < cached.expMs - 5 * 60 * 1000) {
    console.log(`Using cached Bot Framework token for tenant: ${tenantId}`);
    return cached.token;
  }
  
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  console.log(`Getting Bot Framework token from tenant: ${tenantId}`);
  console.log(`Token URL: ${tokenUrl}`);
  console.log(`Client ID: ${clientId.substring(0, 8)}...`);
  
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://api.botframework.com/.default",
  });
  
  try {
    console.log('Making token request...');
    console.log('Request body params:', {
      grant_type: 'client_credentials',
      client_id: clientId.substring(0, 8) + '...',
      scope: 'https://api.botframework.com/.default'
    });
    
    const startTime = Date.now();
    console.log('Making axios request to:', tokenUrl);
    
    const resp = await axios.post(tokenUrl, body, {
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 8000,
    });
    
    const duration = Date.now() - startTime;
    console.log(`Token request completed in ${duration}ms, status: ${resp.status}`);
    
    console.log('Token request successful, status:', resp.status);
    const token = resp.data.access_token as string;
    
    if (!token) {
      throw new Error('No access_token in response');
    }
    
    console.log('Token received, length:', token.length);
    
    // Decode and cache token
    const payload = decodeJwtPayload(token);
    if (payload && payload.exp) {
      tokenCacheByTenant.set(tenantId, {
        token,
        expMs: payload.exp * 1000
      });
      console.log(`Token cached for tenant ${tenantId} until:`, new Date(payload.exp * 1000).toISOString());
    }
    
    return token;
  } catch (error: any) {
    console.error('❌ Token request failed:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error name:', error.name);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('Request made but no response received');
      console.error('Request config:', JSON.stringify({
        url: error.config?.url,
        method: error.config?.method,
        timeout: error.config?.timeout
      }, null, 2));
    } else {
      console.error('Error setting up request:', error.message);
    }
    
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    throw error;
  }
}

// Helper function to send activity to Bot Framework Connector
async function sendToConversation(activity: any, token: string, responseActivity: any): Promise<void> {
  const serviceUrl = (activity.serviceUrl || "").replace(/\/$/, "");
  const convId = activity.conversation.id;
  const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(convId)}/activities`;
  
  console.log('📨 Sending response to Bot Framework Connector');
  console.log('Service URL:', serviceUrl);
  console.log('Conversation ID:', convId);
  console.log('URL:', url);
  console.log('Response activity type:', responseActivity.type);
  console.log('Response has attachments:', !!responseActivity.attachments);
  
  try {
    const response = await axios.post(url, responseActivity, {
      headers: {
        Authorization: `Bearer ${token.substring(0, 20)}...`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
      validateStatus: () => true,
    });
    
    console.log('Bot Framework response status:', response.status);
    
    if (response.status < 200 || response.status >= 300) {
      console.error("❌ Non-2xx response from Bot Framework Connector:");
      console.error("Status:", response.status);
      console.error("Response body:", JSON.stringify(response.data, null, 2));
      throw new Error(`Bot Framework Connector returned status ${response.status}`);
    }
    
    console.log('✅ Successfully sent to Bot Framework Connector');
  } catch (error: any) {
    console.error('❌ Error sending to Bot Framework Connector:');
    console.error('Error message:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

