import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';
import axios from 'axios';
import { clear } from 'console';

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
      // Use specific environment variable names as requested
      const clientId = process.env.CLIENT_ID;
      const clientSecret = process.env.CLIENT_SECRET;
      const tenantId = process.env.MS_TENANT_ID || activity.channelData?.tenant?.id;

      if (!clientId) {
        console.error('❌ CLIENT_ID environment variable is not set');
        throw new Error('CLIENT_ID environment variable must be set');
      }
      if (!clientSecret) {
        console.error('❌ CLIENT_SECRET environment variable is not set');
        throw new Error('CLIENT_SECRET environment variable must be set');
      }
      if (!tenantId) {
        console.error('❌ MS_TENANT_ID environment variable is not set and tenant ID not found in activity');
        throw new Error('MS_TENANT_ID environment variable must be set (or tenant ID must be in activity.channelData.tenant.id)');
      }

      console.log('✅ Environment variables loaded:');
      console.log('  CLIENT_ID:', clientId.substring(0, 8) + '...');
      console.log('  CLIENT_SECRET:', clientSecret ? '[SET]' : '[MISSING]');
      console.log('  MS_TENANT_ID:', tenantId);

      // Create context with send function
      const context: any = {
        activity,
        send: async (response: any) => {
          console.log('📤 context.send() called!');
          console.log('Response type:', response.type);
          console.log('Response attachments:', response.attachments?.length || 0);
          try {
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
  
  // Build form-encoded request body with ALL required fields
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "https://api.botframework.com/.default");
  
  try {
    console.log('[token] Making token request...');
    console.log('[token] Request body params:', {
      grant_type: 'client_credentials',
      client_id: clientId.substring(0, 8) + '...',
      client_secret: clientSecret ? '[INCLUDED]' : '[MISSING]',
      scope: 'https://api.botframework.com/.default'
    });
    console.log('[token] Tenant ID:', tenantId);
    console.log('[token] Client ID:', clientId.substring(0, 8) + '...');
    
    const startTime = Date.now();
    
    // Make the token request with proper form-encoded body
    const resp = await axios.post(tokenUrl, params.toString(), {
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 10000,
    });
    
    const duration = Date.now() - startTime;
    
    // Log success with structured summary
    console.log('[token] success', {
      status: resp.status,
      token_type: resp.data.token_type || 'unknown',
      expires_in: resp.data.expires_in || 'unknown',
      scope: resp.data.scope || 'unknown',
      duration_ms: duration,
    });
    
    const token = resp.data.access_token as string;
    
    if (!token) {
      throw new Error('No access_token in response from Microsoft OAuth endpoint');
    }
    
    console.log(`[token] Token obtained, length: ${token.length} characters`);
    
    // Decode and cache token
    const payload = decodeJwtPayload(token);
    if (payload && payload.exp) {
      tokenCacheByTenant.set(tenantId, {
        token,
        expMs: payload.exp * 1000
      });
      console.log(`[token] Token cached for tenant ${tenantId} until:`, new Date(payload.exp * 1000).toISOString());
    }
    
    return token;
  } catch (err: any) {
    if (err.response) {
      // Non-2xx response from Microsoft
      console.error('[token] FAILED', {
        status: err.response.status,
        data: err.response.data,
        tenantId: tenantId,
        clientId: clientId.substring(0, 8) + '...',
        message: err.message,
      });
    } else {
      // No response received or other error
      console.error('[token] FAILED – no response', {
        message: err.message,
        tenantId: tenantId,
        clientId: clientId.substring(0, 8) + '...',
        error_code: err.code,
        error_name: err.name,
      });
    }
    throw err;
  }
}

// Helper function to send activity to Bot Framework Connector
async function sendToConversation(activity: any, token: string, responseActivity: any): Promise<void> {
  const serviceUrl = (activity.serviceUrl || "").replace(/\/$/, "");
  const convId = activity.conversation.id;
  const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(convId)}/activities`;
  
  console.log('[send] Preparing to send response to Bot Framework Connector');
  console.log('[send] Service URL:', serviceUrl);
  console.log('[send] Conversation ID:', convId);
  console.log('[send] Exact URL:', url);
  console.log('[send] HTTP Method: POST');
  console.log('[send] Response activity type:', responseActivity.type);
  console.log('[send] Response has attachments:', !!responseActivity.attachments);
  console.log('[send] Authorization header:', `Bearer ${token.substring(0, 20)}...`);
  
  try {
    // Use the FULL token in the Authorization header (not truncated!)
    const response = await axios.post(url, responseActivity, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
      validateStatus: () => true,
    });
    
    console.log('[send] HTTP Status:', response.status);
    
    if (response.status < 200 || response.status >= 300) {
      // Non-2xx response
      console.error('[send] FAILED', {
        status: response.status,
        data: response.data,
        url: url,
      });
      throw new Error(`Bot Framework Connector returned status ${response.status}`);
    }
    
    // Success - log response summary
    const responseSummary: any = {
      status: response.status,
    };
    
    if (response.data) {
      if (response.data.id) responseSummary.activityId = response.data.id;
      if (response.data.activityId) responseSummary.activityId = response.data.activityId;
      if (response.data.serviceUrl) responseSummary.serviceUrl = response.data.serviceUrl;
    }
    
    console.log('[send] success', responseSummary);
    console.log('[send] ✅ Successfully sent to Bot Framework Connector');
  } catch (err: any) {
    if (err.response) {
      // Non-2xx response or error response
      console.error('[send] FAILED', {
        status: err.response.status,
        data: err.response.data,
        url: url,
        message: err.message,
      });
    } else {
      // No response received or other error
      console.error('[send] FAILED – no response', {
        message: err.message,
        url: url,
        error_code: err.code,
        error_name: err.name,
      });
    }
    throw err;
  }
}

