import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';

// Initialize app on first import
let appInitialized = false;

async function initializeApp() {
  if (!appInitialized) {
    appInitialized = true;
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const teamsApp = await initializeApp();
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
    const router = (teamsApp as any).router;
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
      const welcomeCard = require("../src/adaptiveCards/welcomeCard.json");
      if (bodyData.value?.type === "start") {
        const question1Card = require("../src/adaptiveCards/question1.json");
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
          const question2Card = require("../src/adaptiveCards/question2.json");
          responseMessages.push({
            type: "message",
            attachments: [{
              contentType: "application/vnd.microsoft.card.adaptive",
              content: question2Card
            }]
          });
        } else if (qId === 2) {
          const question3Card = require("../src/adaptiveCards/question3.json");
          responseMessages.push({
            type: "message",
            attachments: [{
              contentType: "application/vnd.microsoft.card.adaptive",
              content: question3Card
            }]
          });
        } else if (qId === 3) {
          const finalCard = require("../src/adaptiveCards/finalMatchCard.json");
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
    res.status(500).json({ error: error.message });
  }
}

