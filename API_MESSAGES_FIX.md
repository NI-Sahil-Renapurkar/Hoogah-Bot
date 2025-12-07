# /api/messages Endpoint Fix

## Problem
Teams was hitting the ngrok URL with `POST /api/messages` but getting 404 errors. The endpoint wasn't responding correctly.

## Solution
Added an explicit `/api/messages` POST endpoint handler in `src/app.ts` that:
1. Logs all incoming requests for debugging
2. Uses the Teams Apps SDK's built-in `onRequest` method to process activities
3. Handles Bot Framework activities correctly
4. Ensures proper response handling

## Files Changed

### `/src/app.ts`

**Added:** Explicit `/api/messages` POST endpoint handler (lines 188-251)

**Key Changes:**
- Added route handler BEFORE static file serving (important for route precedence)
- Added comprehensive logging to track incoming requests
- Uses SDK's `onRequest` method for proper activity processing
- Includes fallback logic if SDK method isn't available
- Proper error handling and response codes

## Final Code

```typescript
// Explicit /api/messages endpoint for Bot Framework
// This ensures Teams can communicate with the bot via ngrok
// IMPORTANT: This must be registered BEFORE static file serving
app.http.post("/api/messages", async (req: any, res: any) => {
  // Log the request for debugging
  console.log(`[${new Date().toISOString()}] POST /api/messages - Received Bot Framework activity`);
  console.log(`Method: ${req.method}, Path: ${req.path || req.url}`);
  
  try {
    // Ensure request body is parsed (should be done by middleware, but double-check)
    if (!req.body && req.headers['content-type']?.includes('application/json')) {
      let data = '';
      req.on('data', (chunk: any) => { data += chunk.toString(); });
      await new Promise<void>((resolve) => {
        req.on('end', () => {
          try {
            req.body = JSON.parse(data);
          } catch (e) {
            req.body = {};
          }
          resolve();
        });
      });
    }

    const activity = req.body;
    if (!activity) {
      console.error('No activity in request body');
      res.status(400).json({ error: 'No activity in request body' });
      return;
    }

    console.log(`Processing activity - Type: ${activity.type}, ID: ${activity.id}, From: ${activity.from?.name || 'unknown'}`);

    // Use the Teams Apps SDK's built-in request handler
    // The http plugin's onRequest method handles JWT validation and activity processing
    if (app.http && typeof (app.http as any).onRequest === 'function') {
      // Call the SDK's onRequest which processes the activity through the app
      await (app.http as any).onRequest(req, res, () => {
        // Next function for middleware chain (not used in this case)
      });
      // The SDK's onRequest handles the response automatically
    } else {
      // Fallback: Process activity directly using the app's process method
      await app.process(app.http, {
        activity: activity,
        send: async (response: any) => {
          // Responses are sent automatically by the SDK
          console.log(`Sending response: ${response.type || 'activity'}`);
        }
      } as any);

      // Bot Framework expects 200 OK for successful processing
      res.status(200).end();
    }
  } catch (error: any) {
    console.error('Error processing /api/messages:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});
```

## How It Works

1. **Request Arrives**: Teams sends POST to `/api/messages` via ngrok
2. **Logging**: Handler logs method, path, and activity details
3. **Body Parsing**: Ensures request body is parsed (middleware should handle this, but double-checks)
4. **Activity Processing**: Uses SDK's `onRequest` method which:
   - Handles JWT validation (if enabled)
   - Processes the activity through the app's event handlers
   - Sends responses automatically
5. **Response**: SDK handles response sending automatically

## Route Order

**Critical:** The `/api/messages` route must be registered BEFORE static file serving:

```typescript
// 1. Health check
app.http.get("/", ...);

// 2. /api/messages (MUST BE BEFORE static files)
app.http.post("/api/messages", ...);

// 3. Static files (last, as catch-all)
app.http.static("/", "./public");
```

If static files are registered first, they might intercept the `/api/messages` route.

## Testing

After rebuilding and restarting, you should see logs like:

```
[2024-11-24T10:50:00.000Z] POST /api/messages - Received Bot Framework activity
Method: POST, Path: /api/messages
Processing activity - Type: message, ID: abc123, From: John Doe
```

## Verification

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Start the bot:**
   ```bash
   npm start
   ```

3. **Test the endpoint:**
   ```bash
   curl -X POST http://localhost:3978/api/messages \
     -H "Content-Type: application/json" \
     -d '{"type": "message", "text": "test", "from": {"id": "test"}, "conversation": {"id": "test"}}'
   ```

4. **Check logs:** You should see the logging output in the console

5. **Test with ngrok:** When Teams sends requests through ngrok, you should see the logs and the bot should respond

## Notes

- The Teams Apps SDK should automatically register `/api/messages` in its `onInit()` method
- This explicit handler ensures it works even if the SDK's auto-registration fails
- The handler uses the SDK's built-in processing, so it maintains compatibility with Teams authentication
- All Bot Framework activities are processed through the app's event handlers in `bot.ts`

