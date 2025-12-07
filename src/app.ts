import { App } from "@microsoft/teams.apps";
import { LocalStorage } from "@microsoft/teams.common";
import { ConsoleLogger } from "@microsoft/teams.common/logging";
import { setupBot } from "./bot";
import axios from "axios";

// Create storage for conversation history
const storage = new LocalStorage();

// Create logger
const logger = new ConsoleLogger("HoogahBot");

// Create the Teams app with storage and logger
// Configure bot credentials if available (needed for sending responses)
// SDK automatically reads CLIENT_ID and CLIENT_SECRET from environment
// But we can also explicitly pass them
const clientId = process.env.CLIENT_ID || process.env.BOT_ID || '';
const clientSecret = process.env.CLIENT_SECRET || process.env.BOT_PASSWORD || process.env.CLIENT_PASSWORD || process.env.SECRET_BOT_PASSWORD || '';

console.log('Bot credentials check:');
console.log('  CLIENT_ID present:', !!clientId);
console.log('  CLIENT_SECRET present:', !!clientSecret);
console.log('  CLIENT_ID value:', clientId || '(not set)');
console.log('');
console.log('⚠️  BOT REGISTRATION VERIFICATION:');
console.log('  Teams app manifest botId must match CLIENT_ID above');
console.log('  Azure App Registration "Application (client) ID" must match CLIENT_ID above');
console.log('  Secret must be from that same App Registration (use Value, not Secret ID)');
console.log('  Azure Bot "Messaging endpoint" must point to: https://<your-ngrok>/api/messages');
console.log('  Note: activity.recipient.id is channel-scoped (e.g., 28:...) and may differ from CLIENT_ID');
console.log('');

// Create the Teams app with storage and logger
// SDK will automatically use CLIENT_ID and CLIENT_SECRET from env if not provided
const app = new App({
  storage,
  logger,
  // Explicitly pass credentials (SDK will use env vars if these are empty)
  clientId: clientId || undefined,
  clientSecret: clientSecret || undefined,
});

// Setup bot logic
setupBot(app);

// Ensure http plugin has logger (workaround for SDK issue)
if (app.http && !(app.http as any).logger) {
  (app.http as any).logger = logger;
}

// Setup error handler for http plugin
// The http plugin needs $onError to be set
if (app.http && !(app.http as any).$onError) {
  (app.http as any).$onError = (event: any) => {
    logger.error("HTTP plugin error:", event.error);
  };
}

// Note: The SDK's http plugin already adds express.json() middleware for /api* routes

// Simple test endpoint for local testing (bypasses Bot Framework auth)
// Register routes before server starts
app.http.post("/chat", async (req: any, res: any) => {
  try {
    const bodyData = req.body || {};
    const responseMessages: any[] = [];
    
    // Create a mock Bot Framework activity from the request
    const activity = {
      type: "message",
      text: (bodyData?.text || bodyData?.message || "hi") as string,
      id: `test-${Date.now()}`,
      from: {
        id: "test-user",
        name: "Test User"
      },
      conversation: {
        id: "test-conversation",
        conversationType: "personal"
      },
      channelId: "msteams",
      serviceUrl: "https://smba.trafficmanager.net/amer/",
      timestamp: new Date()
    };

    // Create a mock context that captures responses
    const mockContext: any = {
      activity: activity,
      send: async (response: any) => {
        responseMessages.push(response);
      }
    };

    // Trigger message handlers using the router
    const router = (app as any).router;
    let handlersCalled = false;
    
    if (router && router.routes) {
      const messageRoute = router.routes.find((r: any) => r.name === "message");
      if (messageRoute) {
        const handlers = messageRoute.handlers || messageRoute._handlers || messageRoute.callbacks || [];
        for (const handler of handlers) {
          try {
            await handler(mockContext);
            handlersCalled = true;
          } catch (e: any) {
            console.error("Handler error:", e.message);
          }
        }
      }
    }
    
    // Fallback: manual bot logic for testing
    if (!handlersCalled) {
      const welcomeCard = require("./adaptiveCards/welcomeCard.json");
      if (bodyData.value?.type === "start") {
        const question1Card = require("./adaptiveCards/question1.json");
        responseMessages.push({
          type: "message",
          attachments: [{
            contentType: "application/vnd.microsoft.card.adaptive",
            content: question1Card
          }]
        });
      } else if (bodyData.value?.type === "answer") {
        const qId = bodyData.value.questionId;
        if (qId === 1) {
          const question2Card = require("./adaptiveCards/question2.json");
          responseMessages.push({
            type: "message",
            attachments: [{
              contentType: "application/vnd.microsoft.card.adaptive",
              content: question2Card
            }]
          });
        } else if (qId === 2) {
          const question3Card = require("./adaptiveCards/question3.json");
          responseMessages.push({
            type: "message",
            attachments: [{
              contentType: "application/vnd.microsoft.card.adaptive",
              content: question3Card
            }]
          });
        } else if (qId === 3) {
          const finalCard = require("./adaptiveCards/finalMatchCard.json");
          responseMessages.push({
            type: "message",
            attachments: [{
              contentType: "application/vnd.microsoft.card.adaptive",
              content: finalCard
            }]
          });
        }
      } else if (!bodyData.value && bodyData.text) {
        responseMessages.push({
          type: "message",
          attachments: [{
            contentType: "application/vnd.microsoft.card.adaptive",
            content: welcomeCard
          }]
        });
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
    res.json({
      success: true,
      messages: responseMessages,
      received: activity.text
    });
  } catch (error: any) {
    console.error('Error processing activity:', error);
  }
});

// Health check endpoint
app.http.get("/", (req, res) => {
  res.status(200).send("Bot is running!");
});

// Helper function to decode JWT payload (base64url, not base64)
function decodeJwtPayload(token: string): any | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const b64url = parts[1];
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const json = Buffer.from(b64, "base64").toString("utf8");
  return JSON.parse(json);
}

// Token cache per tenant (tokens are tenant-issued)
type TokenCacheEntry = { token: string; expMs: number };
const tokenCacheByTenant = new Map<string, TokenCacheEntry>();

// Helper function to get Bot Framework token from tenant-specific endpoint
async function getBotFrameworkToken(clientId: string, clientSecret: string, tenantId: string): Promise<string> {
  // Check cache first (reuse if not expired within 5 minutes)
  const now = Date.now();
  const cached = tokenCacheByTenant.get(tenantId);
  if (cached && now < cached.expMs - 5 * 60 * 1000) {
    console.log(`Using cached Bot Framework token for tenant: ${tenantId}`);
    return cached.token;
  }
  
  // Build tenant-specific token URL
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  console.log(`Getting Bot Framework token from tenant: ${tenantId}`);
  console.log(`Token URL: ${tokenUrl}`);
  
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
  
  // Decode JWT payload to verify token and get expiry
  const payload = decodeJwtPayload(token);
  if (payload) {
    console.log("Token payload - tid (tenant):", payload.tid);
    console.log("Token payload - iss (issuer):", payload.iss);
    console.log("Token payload - aud (audience):", payload.aud);
    console.log("Token payload - appid/azp:", payload.appid || payload.azp);
    console.log("Token payload - exp:", new Date(payload.exp * 1000).toISOString());
    
    // Verify audience
    if (payload.aud !== 'https://api.botframework.com' && payload.aud !== 'api.botframework.com') {
      console.warn('⚠️ Token audience mismatch! Expected api.botframework.com, got:', payload.aud);
    }
    
    // Verify app ID
    const tokenAppId = payload.appid || payload.azp;
    if (tokenAppId !== clientId) {
      console.warn('⚠️ Token app ID mismatch! Expected:', clientId, 'got:', tokenAppId);
    }
    
    // Verify tenant ID matches
    if (payload.tid !== tenantId) {
      console.warn('⚠️ Token tenant mismatch! Expected:', tenantId, 'got:', payload.tid);
    }
    
    // Cache token per tenant until 5 minutes before expiry
    if (payload.exp) {
      tokenCacheByTenant.set(tenantId, {
        token,
        expMs: payload.exp * 1000
      });
      console.log(`Token cached for tenant ${tenantId} until:`, new Date(payload.exp * 1000).toISOString());
    }
  } else {
    console.warn('Could not decode token payload');
  }
  
  return token;
}

// Helper function to send activity to Bot Framework Connector using plain axios
async function sendToConversation(activity: any, token: string, responseActivity: any): Promise<void> {
  // Use exact serviceUrl from activity (only trim trailing slash)
  const serviceUrl = (activity.serviceUrl || "").replace(/\/$/, "");
  const convId = activity.conversation.id;
  const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(convId)}/activities`;
  
  console.log('Sending to:', url);
  console.log('Using serviceUrl from activity:', serviceUrl);
  
  try {
    const response = await axios.post(url, responseActivity, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status
    });
    
    // Check if status is not 2xx
    if (response.status < 200 || response.status >= 300) {
      console.error("❌ Non-2xx response from Bot Framework Connector:");
      console.error("Status:", response.status);
      console.error("WWW-Authenticate:", response.headers?.["www-authenticate"]);
      console.error("Response body:", JSON.stringify(response.data, null, 2));
      throw new Error(`Bot Framework Connector returned status ${response.status}`);
    }
  } catch (error: any) {
    // Log detailed error information for Connector failures
    if (error.response) {
      console.error("❌ Connector failure:");
      console.error("Status:", error.response.status);
      console.error("WWW-Authenticate:", error.response.headers?.["www-authenticate"]);
      console.error("Response body:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error (no response):", error.message);
    }
    throw error;
  }
}

// Bot Framework endpoint - Process activities through app's handlers
app.http.post("/api/messages", (req: any, res: any) => {
  console.log(`[${new Date().toISOString()}] POST /api/messages`);
  
  const activity = req.body;
  if (!activity) {
    res.status(400).json({ error: 'No activity' });
    return;
  }

  // Log incoming activity details for debugging
  console.log('Incoming activity - recipient.id:', activity.recipient?.id, '(channel-scoped, e.g., 28:...)');
  console.log('Incoming activity - channelId:', activity.channelId);
  console.log('Incoming activity - serviceUrl:', activity.serviceUrl);

  // ACK immediately (Bot Framework requirement - prevents Teams retries/timeouts)
  res.sendStatus(200);

  // Process in background (async)
  void (async () => {
    try {
      // Create context with send function that uses Bot Framework token
      const context: any = {
        activity,
      send: async (response: any) => {
        try {
          if (!clientId || !clientSecret) {
            throw new Error('CLIENT_ID and CLIENT_SECRET must be set');
          }
          
          // Extract tenantId from activity (with fallback)
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
            from: activity.recipient,     // bot
            recipient: activity.from,     // user
            ...response,
          };
          
          // Send to Bot Framework Connector using plain axios
          await sendToConversation(activity, token, responseActivity);
          console.log('✅ Response sent successfully');
        } catch (error: any) {
          console.error('Send error:', error.message);
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
      const router = (app as any).router;
      
      if (router && typeof router.select === 'function') {
        const routes = router.select(activity);
        console.log('Routes selected:', routes.length);
        
        if (routes.length > 0) {
          for (const route of routes) {
            await route(context);
          }
        }
      }
    } catch (error: any) {
      console.error('Error processing activity:', error);
    }
  })();
});

// Serve static files from public folder (must be after /api/messages to avoid conflicts)
app.http.static("/", "./public");

// HTTP server setup
const start = async () => {
  const port = process.env.PORT || process.env.port || 3978;
  // The http plugin handles /api/messages automatically
  // Start the server using the http plugin's onStart method
  await app.http.onStart({ port: Number(port) });
  console.log(`\nBot started, app listening on port ${port}`);
  console.log(`Test endpoint available at: POST http://localhost:${port}/chat`);
};

// Export app with start method
const appWithStart = {
  ...app,
  start,
};

export default appWithStart;

