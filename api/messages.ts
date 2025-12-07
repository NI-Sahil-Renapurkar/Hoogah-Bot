import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';
import axios from 'axios';

// Initialize app on first import
let appInitialized = false;

async function initializeApp() {
  if (!appInitialized) {
    // Don't call app.start() in serverless - just initialize
    appInitialized = true;
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const teamsApp = await initializeApp();
  
  // Get the activity from request body
  const activity = req.body;
  if (!activity) {
    return res.status(400).json({ error: 'No activity' });
  }

  // Log incoming activity details for debugging
  console.log(`[${new Date().toISOString()}] POST /api/messages`);
  console.log('Incoming activity - recipient.id:', activity.recipient?.id);
  console.log('Incoming activity - channelId:', activity.channelId);
  console.log('Incoming activity - serviceUrl:', activity.serviceUrl);

  // ACK immediately (Bot Framework requirement)
  res.status(200).send('OK');

  // Process in background (async)
  void (async () => {
    try {
      const clientId = process.env.CLIENT_ID || process.env.BOT_ID || '';
      const clientSecret = process.env.CLIENT_SECRET || process.env.BOT_PASSWORD || process.env.CLIENT_PASSWORD || process.env.SECRET_BOT_PASSWORD || '';

      // Create context with send function
      const context: any = {
        activity,
        send: async (response: any) => {
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
            const token = await getBotFrameworkToken(clientId, clientSecret, tenantId);
            
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
            console.error('Send error:', error.message);
            if (error.response) {
              console.error('Status:', error.response.status);
              console.error('WWW-Authenticate:', error.response.headers?.["www-authenticate"]);
              console.error('Data:', JSON.stringify(error.response.data, null, 2));
            }
          }
        },
      };

      // Trigger app.on("message") handlers via router
      const router = (teamsApp as any).router;
      console.log('Router exists:', !!router);
      console.log('Router type:', typeof router);
      
      if (router && typeof router.select === 'function') {
        const routes = router.select(activity);
        console.log('Routes selected:', routes.length);
        
        if (routes.length > 0) {
          for (const route of routes) {
            console.log('Calling route handler');
            await route(context);
          }
        } else {
          console.warn('No routes selected for activity type:', activity.type);
        }
      } else {
        console.warn('Router not available or select function not found');
        // Fallback: try to call handlers directly
        if (router && router.routes) {
          console.log('Trying fallback: router.routes');
          const messageRoute = router.routes.find((r: any) => r.name === "message");
          if (messageRoute) {
            const handlers = messageRoute.handlers || messageRoute._handlers || messageRoute.callbacks || [];
            console.log('Found handlers:', handlers.length);
            for (const handler of handlers) {
              try {
                await handler(context);
              } catch (e: any) {
                console.error("Handler error:", e.message);
              }
            }
          }
        }
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
  
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://api.botframework.com/.default",
  });
  
  const resp = await axios.post(tokenUrl, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  
  const token = resp.data.access_token as string;
  
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
}

// Helper function to send activity to Bot Framework Connector
async function sendToConversation(activity: any, token: string, responseActivity: any): Promise<void> {
  const serviceUrl = (activity.serviceUrl || "").replace(/\/$/, "");
  const convId = activity.conversation.id;
  const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(convId)}/activities`;
  
  console.log('Sending to:', url);
  
  const response = await axios.post(url, responseActivity, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 10000,
    validateStatus: () => true,
  });
  
  if (response.status < 200 || response.status >= 300) {
    console.error("❌ Non-2xx response from Bot Framework Connector:");
    console.error("Status:", response.status);
    console.error("Response body:", JSON.stringify(response.data, null, 2));
    throw new Error(`Bot Framework Connector returned status ${response.status}`);
  }
}

