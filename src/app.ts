import { App } from "@microsoft/teams.apps";
import { LocalStorage } from "@microsoft/teams.common";
import { ConsoleLogger } from "@microsoft/teams.common/logging";
import { setupBot } from "./bot";
import { TurnContext } from "botbuilder";

// Create storage for conversation history
const storage = new LocalStorage();

// Create logger
const logger = new ConsoleLogger("HoogahBot");

// Create the Teams app with storage and logger.
// Credentials are provided via env vars and handled by the Bot Framework adapter in /api/messages.
const app = new App({
  storage,
  logger,
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

// Run the Teams app router using a Bot Framework TurnContext.
// This is invoked from the Vercel /api/messages handler via CloudAdapter.
export async function runTeamsAppWithTurnContext(turnContext: TurnContext): Promise<void> {
  const activity = turnContext.activity;
  const router = (app as any).router;

  console.log('[router] Activity type:', activity?.type);
  console.log('[router] Channel:', activity?.channelId);
  console.log('[router] Text:', activity?.text);

  if (!router) {
    console.error('[router] Router not initialized on app');
    return;
  }

  const context: any = {
    activity,
    // Align with previous context.send API used by existing handlers
    send: async (response: any) => {
      const responseActivity = {
        type: "message",
        ...response,
      };
      console.log('📤 context.send() via adapter!');
      console.log('Response type:', responseActivity.type);
      console.log('Response attachments:', responseActivity.attachments?.length || 0);
      await turnContext.sendActivity(responseActivity);
    },
  };

  let handlerCalled = false;

  // Primary path: router.select
  if (typeof router.select === 'function') {
    const routes = router.select(activity) || [];
    console.log('[router] Routes selected:', routes.length);
    for (const route of routes) {
      try {
        await route(context);
        handlerCalled = true;
      } catch (err: any) {
        console.error('[router] Route handler error:', err?.message || err);
      }
    }
  }

  // Fallback path: router.routes direct handlers
  if (!handlerCalled && router.routes) {
    const messageRoute = router.routes.find((r: any) => r.name === "message");
    if (messageRoute) {
      const handlers = messageRoute.handlers || messageRoute._handlers || messageRoute.callbacks || [];
      console.log('[router] Fallback handlers:', handlers.length);
      for (const handler of handlers) {
        try {
          await handler(context);
          handlerCalled = true;
        } catch (err: any) {
          console.error('[router] Handler error:', err?.message || err);
        }
      }
    } else {
      console.warn('[router] Message route not found');
    }
  }

  if (!handlerCalled) {
    console.warn('⚠️ No handlers were called for this activity');
  } else {
    console.log('[router] Handler executed successfully');
  }
}

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

