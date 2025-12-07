# Bot Framework Authentication Issue

## Problem Summary

We are building a Microsoft Teams bot using the `@microsoft/teams.apps` SDK (v2.0.0) in TypeScript. The bot receives messages from Teams successfully, but when trying to send responses back, we get a **401 Unauthorized** error: "Authorization has been denied for this request."

## Current Code Implementation

### 1. App Setup (`src/app.ts`)

```typescript
import { App } from "@microsoft/teams.apps";
import { LocalStorage } from "@microsoft/teams.common";
import { ConsoleLogger } from "@microsoft/teams.common/logging";
import { setupBot } from "./bot";
import axios from "axios";
import { Client } from "@microsoft/teams.api";

// Create storage and logger
const storage = new LocalStorage();
const logger = new ConsoleLogger("HoogahBot");

// Get credentials from environment
const clientId = process.env.CLIENT_ID || process.env.BOT_ID || '';
const clientSecret = process.env.CLIENT_SECRET || process.env.BOT_PASSWORD || '';

// Create the Teams app with credentials
const app = new App({
  storage,
  logger,
  clientId: clientId || undefined,
  clientSecret: clientSecret || undefined,
});

// Setup bot logic
setupBot(app);
```

**Reason**: We're using the Microsoft 365 Agents Toolkit SDK which provides a high-level abstraction for Teams bot development. The App is initialized with bot credentials (CLIENT_ID and CLIENT_SECRET) from environment variables.

### 2. `/api/messages` Endpoint Handler

```typescript
app.http.post("/api/messages", async (req: any, res: any) => {
  console.log(`[${new Date().toISOString()}] POST /api/messages`);
  
  const activity = req.body;ee
  if (!activity) {
    res.status(400).json({ error: 'No activity' });
    return;
  }

  // Extract authorization header from incoming request
  const authHeader = req.headers.authorization || req.headers.Authorization || '';

  // Send 200 OK immediately (Bot Framework requirement)
  res.status(200).end();

  try {
    // Create context with send function
    const context: any = {
      activity,
      send: async (response: any) => {
        try {
          const responseActivity: any = {
            type: 'message',
            conversation: activity.conversation,
            from: activity.recipient,
            recipient: activity.from,
            ...response,
          };
          
          const serviceUrl = activity.serviceUrl.endsWith('/') 
            ? activity.serviceUrl.slice(0, -1) 
            : activity.serviceUrl;
          
          // Get Bot Framework token using OAuth2 client credentials flow
          console.log('Getting Bot Framework token via OAuth2...');
          
          if (!clientId || !clientSecret) {
            throw new Error('CLIENT_ID and CLIENT_SECRET must be set');
          }
          
          // Get token from Microsoft OAuth2 endpoint
          const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
          const tokenResponse = await axios.post(
            tokenUrl,
            new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: clientId,
              client_secret: clientSecret,
              scope: 'https://api.botframework.com/.default'
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            }
          );
          
          const botToken = tokenResponse.data.access_token;
          if (!botToken) {
            throw new Error('Failed to get access token from OAuth2');
          }
          
          console.log('Bot Framework token obtained, length:', botToken.length);
          console.log('Sending to:', `${serviceUrl}/v3/conversations/${activity.conversation.id}/activities`);
          
          // Use bot token to send response
          const client = new Client(serviceUrl, { token: async () => botToken });
          await client.conversations.activities(activity.conversation.id).create(responseActivity);
          console.log('✅ Response sent successfully');
        } catch (error: any) {
          console.error('Send error:', error.message);
          if (error.response) {
            console.error('Status:', error.response.status);
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
});
```

**Reason**: 
- We manually handle `/api/messages` because the SDK's automatic handling wasn't working correctly
- We create a custom `send` function that:
  1. Gets a Bot Framework token via OAuth2 client credentials flow
  2. Uses the `@microsoft/teams.api` Client to send the response
- We use the router to trigger bot handlers that call `context.send()` with adaptive cards

### 3. Bot Logic (`src/bot.ts`)

```typescript
import { App } from "@microsoft/teams.apps";

export function setupBot(app: App) {
  // In-memory state storage
  const userState: Record<string, { q1?: string; q2?: string; q3?: string; }> = {};

  // Helper to get user state
  function getUserState(conversationId: string) {
    if (!userState[conversationId]) {
      userState[conversationId] = {};
    }
    return userState[conversationId];
  }

  // Helper to create card attachment
  function createCardAttachment(cardJson: any) {
    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: cardJson
    };
  }

  // Handle message activities
  app.on("message", async (context: any) => {
    const activity = context.activity;
    const conversationId = activity.conversation.id;
    
    // Handle adaptive card button clicks
    if (activity.value) {
      const data = activity.value;
      
      if (data.type === "start") {
        // Send question 1
        const question1 = require("./adaptiveCards/question1.json");
        await context.send({
          type: "message",
          attachments: [createCardAttachment(question1)]
        });
        return;
      }
      
      if (data.type === "answer") {
        const state = getUserState(conversationId);
        const questionId = data.questionId;
        const answer = data.value;
        
        // Store answer
        if (questionId === 1) state.q1 = answer;
        if (questionId === 2) state.q2 = answer;
        if (questionId === 3) state.q3 = answer;
        
        // Send next question or final card
        // ... (logic to send next question or final match card)
      }
    }
    
    // Handle text messages (e.g., "Hi")
    if (activity.text) {
      const welcomeCard = require("./adaptiveCards/welcomeCard.json");
      await context.send({
        type: "message",
        attachments: [createCardAttachment(welcomeCard)]
      });
    }
  });
}
```

**Reason**: The bot logic handles:
- Welcome card on first message
- Sequential questions via adaptive cards
- State management per conversation
- Final match card after all questions

## The Issue

### Error Details

When the bot tries to send a response, we get:

```
Send error: Request failed with status code 401
Status: 401
Data: {
  "message": "Authorization has been denied for this request."
}
```

### What We've Tried

1. **Using SDK's `app.getBotToken()`**: 
   - Token was retrieved successfully (length: 1474)
   - But still got 401 error
   - Suspected wrong scope/audience

2. **Direct OAuth2 token request**:
   - Using `https://login.microsoftonline.com/common/oauth2/v2.0/token`
   - With scope: `https://api.botframework.com/.default`
   - Still getting 401

3. **Using incoming request's auth token**:
   - Tried reusing the token from `Authorization` header
   - Also got 401 (expected - that token is for receiving, not sending)

### Current Status

- ✅ Bot receives messages from Teams successfully
- ✅ Bot logic executes correctly
- ✅ Token is obtained (either via SDK or OAuth2)
- ❌ **Sending responses fails with 401 Unauthorized**

### Environment

- **SDK**: `@microsoft/teams.apps` v2.0.0
- **Runtime**: Node.js
- **Language**: TypeScript
- **Bot Registration**: Azure Bot Service
- **Credentials**: CLIENT_ID and CLIENT_SECRET are set and verified

### Questions

1. Is the OAuth2 endpoint correct? Should we use a different tenant endpoint?
2. Is the scope `https://api.botframework.com/.default` correct for sending messages?
3. Should we be using a different authentication method?
4. Is there a specific way the `@microsoft/teams.api` Client expects the token?
5. Are we missing any required headers or request parameters?

### Additional Context

- The bot is registered in Azure Bot Service
- The messaging endpoint is configured correctly (verified via ngrok)
- CLIENT_ID and CLIENT_SECRET are valid (bot can receive messages)
- The serviceUrl from incoming activities is: `https://smba.trafficmanager.net/in/{tenant-id}/`
- We're sending to: `{serviceUrl}/v3/conversations/{conversationId}/activities`

## Request for Help

We need help understanding:
1. Why the token authentication is failing even though we're getting a token
2. What the correct authentication flow should be for sending Bot Framework messages
3. Whether we should be using a different SDK method or approach

Any guidance would be greatly appreciated!

