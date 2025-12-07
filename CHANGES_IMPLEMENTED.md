# Changes Implemented Based on ChatGPT Feedback

## Summary

Implemented the fixes suggested by ChatGPT to resolve the 401 Unauthorized error when sending bot responses. The main changes were:
1. Using `botframework.com` tenant instead of `/common`
2. Using plain `axios` instead of SDK's `Client`
3. Using exact `serviceUrl` from activity
4. Adding JWT token verification

## Changes Made

### 1. Added Helper Function: `getBotFrameworkToken()`

**Location**: `src/app.ts` (before `/api/messages` endpoint)

**Code**:
```typescript
async function getBotFrameworkToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";
  
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
  
  // Decode JWT payload to verify token (sanity check)
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        console.log('Token payload - aud:', payload.aud);
        console.log('Token payload - appid/azp:', payload.appid || payload.azp);
        console.log('Token payload - exp:', new Date(payload.exp * 1000).toISOString());
        
        // Verify audience
        if (payload.aud !== 'https://api.botframework.com' && payload.aud !== 'api.botframework.com') {
          console.warn('⚠️ Token audience mismatch! Expected api.botframework.com, got:', payload.aud);
        }
        
        // Verify app ID
        const tokenAppId = payload.appid || payload.azp;
        if (tokenAppId !== clientId) {
          console.warn('⚠️ Token app ID mismatch! Expected:', clientId, 'got:', tokenAppId);
        }
      }
    } catch (e) {
      console.warn('Could not decode token payload:', e);
    }
  }
  
  return token;
}
```

**Key Changes**:
- ✅ Changed from `https://login.microsoftonline.com/common/oauth2/v2.0/token` to `https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token`
- ✅ Added JWT payload decoding to verify token audience and app ID
- ✅ Logs warnings if token doesn't match expected values

### 2. Added Helper Function: `sendToConversation()`

**Location**: `src/app.ts` (after `getBotFrameworkToken()`)

**Code**:
```typescript
async function sendToConversation(activity: any, token: string, responseActivity: any): Promise<void> {
  // Use exact serviceUrl from activity (only trim trailing slash)
  const serviceUrl = (activity.serviceUrl || "").replace(/\/$/, "");
  const convId = activity.conversation.id;
  const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(convId)}/activities`;
  
  console.log('Sending to:', url);
  console.log('Using serviceUrl from activity:', serviceUrl);
  
  await axios.post(url, responseActivity, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}
```

**Key Changes**:
- ✅ Uses plain `axios.post()` instead of SDK's `Client`
- ✅ Uses exact `serviceUrl` from activity (only trims trailing slash)
- ✅ URL-encodes conversation ID
- ✅ Sets `Authorization: Bearer ${token}` header directly

### 3. Updated `/api/messages` Endpoint Handler

**Location**: `src/app.ts` (replaced the entire send function)

**Before**:
- Used `https://login.microsoftonline.com/common/oauth2/v2.0/token`
- Used SDK's `Client` from `@microsoft/teams.api`
- Modified serviceUrl

**After**:
```typescript
app.http.post("/api/messages", async (req: any, res: any) => {
  console.log(`[${new Date().toISOString()}] POST /api/messages`);
  
  const activity = req.body;
  if (!activity) {
    res.status(400).json({ error: 'No activity' });
    return;
  }

  // Send 200 OK immediately (Bot Framework requirement)
  res.status(200).end();

  try {
    // Create context with send function that uses Bot Framework token
    const context: any = {
      activity,
      send: async (response: any) => {
        try {
          if (!clientId || !clientSecret) {
            throw new Error('CLIENT_ID and CLIENT_SECRET must be set');
          }
          
          // Get Bot Framework token
          console.log('Getting Bot Framework token from botframework.com...');
          const token = await getBotFrameworkToken(clientId, clientSecret);
          
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

**Key Changes**:
- ✅ Removed unused `authHeader` extraction
- ✅ Calls `getBotFrameworkToken()` helper function
- ✅ Calls `sendToConversation()` helper function
- ✅ No longer uses SDK's `Client` class

### 4. Removed Unused Import

**Location**: `src/app.ts` (top of file)

**Removed**:
```typescript
import { Client } from "@microsoft/teams.api";
```

**Reason**: We're now using plain `axios` instead of the SDK's `Client` class.

## What This Fixes

1. **Correct Tenant**: Using `botframework.com` tenant ensures we get a token with the correct audience for Bot Framework API
2. **Direct HTTP**: Using plain `axios` avoids SDK abstraction issues and gives us full control
3. **Exact Service URL**: Using the exact `serviceUrl` from the activity ensures we're hitting the correct regional endpoint
4. **Token Verification**: JWT decoding helps us verify the token is correct before sending

## Expected Behavior After Changes

1. Token is obtained from `botframework.com` tenant
2. Token payload shows:
   - `aud`: `https://api.botframework.com` or `api.botframework.com`
   - `appid/azp`: Matches your CLIENT_ID
3. Response is sent using plain axios to the exact serviceUrl
4. No more 401 errors - responses should be sent successfully

## Testing

After these changes:
1. Restart the bot: `npm start`
2. Send "Hi" in Teams
3. Check logs for:
   - "Getting Bot Framework token from botframework.com..."
   - "Token payload - aud: https://api.botframework.com"
   - "Token payload - appid/azp: [your-client-id]"
   - "✅ Response sent successfully"

The welcome card should now appear in Teams without 401 errors.

---

## Additional Fixes (Round 2)

Based on further ChatGPT feedback, implemented additional hardening:

### 1. Fixed JWT Decoding (base64url vs base64)

**Problem**: JWT payload uses base64url encoding, not standard base64. The previous decode would randomly fail.

**Solution**: Added proper `decodeJwtPayload()` helper function:

```typescript
function decodeJwtPayload(token: string): any | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const b64url = parts[1];
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const json = Buffer.from(b64, "base64").toString("utf8");
  return JSON.parse(json);
}
```

**Usage**:
```typescript
const payload = decodeJwtPayload(token);
if (payload) {
  console.log("Token payload - aud:", payload.aud);
  console.log("Token payload - appid/azp:", payload.appid || payload.azp);
  console.log("Token payload - exp:", new Date(payload.exp * 1000).toISOString());
}
```

### 2. Moved Response Status to End

**Problem**: `res.status(200).end()` was called immediately, before routing. This could cause issues if middleware expects the response to still be open.

**Solution**: Moved response status to after routing completes:

```typescript
try {
  // ... run router which will call context.send()
  res.sendStatus(200);
} catch (e) {
  // log
  res.sendStatus(500);
}
```

**Removed**: The early `res.status(200).end()` call.

### 3. Added WWW-Authenticate Header Logging

**Problem**: 401 errors don't always provide clear reasons. The `WWW-Authenticate` header often contains specific auth failure reasons.

**Solution**: Added logging in `sendToConversation()`:

```typescript
catch (error: any) {
  // Log WWW-Authenticate header for 401 errors (helps diagnose auth issues)
  if (error.response) {
    console.error("Status:", error.response.status);
    console.error("WWW-Authenticate:", error.response.headers?.["www-authenticate"]);
    console.error("Data:", JSON.stringify(error.response.data, null, 2));
  }
  throw error;
}
```

This header often tells you "invalid audience", "invalid issuer", etc.

### 4. Added Token Caching

**Problem**: Fetching a new token for every message is inefficient and can cause rate limiting.

**Solution**: Added token cache that reuses tokens until 5 minutes before expiry:

```typescript
// Token cache to avoid fetching new token for every message
let tokenCache: { token: string; expMs: number } | null = null;

// In getBotFrameworkToken():
// Check cache first (reuse if not expired within 5 minutes)
const now = Date.now();
if (tokenCache && now < tokenCache.expMs - 5 * 60 * 1000) {
  console.log('Using cached Bot Framework token');
  return tokenCache.token;
}

// After getting token:
if (payload.exp) {
  tokenCache = {
    token,
    expMs: payload.exp * 1000
  };
  console.log('Token cached until:', new Date(tokenCache.expMs).toISOString());
}
```

**Benefits**:
- Reduces API calls to token endpoint
- Improves performance
- Prevents rate limiting issues

## Summary of All Changes

1. ✅ Changed token endpoint from `/common` to `botframework.com`
2. ✅ Removed SDK Client, using plain axios
3. ✅ Using exact serviceUrl from activity
4. ✅ Fixed JWT decoding (base64url)
5. ✅ Moved response status to end
6. ✅ Added WWW-Authenticate header logging
7. ✅ Added token caching

## Expected Behavior After All Fixes

1. Token is correctly decoded (no random failures)
2. Response is sent after processing completes
3. Better error messages if 401 occurs (WWW-Authenticate header)
4. Token is cached and reused (better performance)
5. If token shows correct `aud` and `appid`, but still 401 → check bot registration mismatch

## Important Note

If after all these fixes you still get 401 AND your decoded token shows:
- `aud = https://api.botframework.com` ✅
- `appid/azp = your clientId` ✅

Then the issue is usually **bot registration mismatch**. Compare:
- Teams app manifest `botId`
- AAD App Registration (clientId)

They must be the same.

---

## Final Fixes (Round 3 - Critical for Production)

### 1. ACK Immediately, Process Async

**Problem**: Bot Framework wants webhooks to respond fast. Waiting for token fetch + axios.post can cause Teams retries/timeouts even if sending succeeds.

**Solution**: ACK with 200 immediately, then process in background:

```typescript
app.http.post("/api/messages", (req: any, res: any) => {
  const activity = req.body;
  if (!activity) {
    res.status(400).json({ error: 'No activity' });
    return;
  }

  // ACK immediately (prevents Teams retries/timeouts)
  res.sendStatus(200);

  // Process in background (async)
  void (async () => {
    try {
      // ... run router + sends
      const context = { activity, send: async (...) => { ... } };
      const router = (app as any).router;
      const routes = router?.select?.(activity) ?? [];
      for (const route of routes) await route(context);
    } catch (e) {
      console.error("Error processing activity:", e);
    }
  })();
});
```

**Key Changes**:
- ✅ Handler is no longer `async` - it's synchronous
- ✅ `res.sendStatus(200)` called immediately
- ✅ Processing happens in background with `void (async () => { ... })()`
- ✅ This single change avoids "it receives but doesn't respond" flakiness

### 2. Added Bot Registration Verification Logging

**Problem**: 401 errors often caused by bot registration mismatch, but hard to diagnose.

**Solution**: Added startup and incoming activity logging:

**Startup Logging**:
```typescript
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
```

**Incoming Activity Logging**:
```typescript
// Log incoming activity details for bot registration verification
console.log('Incoming activity - recipient.id:', activity.recipient?.id);
console.log('Incoming activity - channelId:', activity.channelId);
console.log('Incoming activity - serviceUrl:', activity.serviceUrl);
```

**Verification Checklist**:
1. ✅ Teams app manifest `botId` == `CLIENT_ID` (from startup log)
2. ✅ Azure App Registration "Application (client) ID" == `CLIENT_ID`
3. ✅ Secret is from that same App Registration (use **Value**, not Secret ID)
4. ✅ Azure Bot "Messaging endpoint" points to `https://<ngrok>/api/messages`
5. ✅ Incoming `activity.recipient.id` should match your bot's App ID

## Complete Summary of All Changes

1. ✅ Changed token endpoint from `/common` to `botframework.com`
2. ✅ Removed SDK Client, using plain axios
3. ✅ Using exact serviceUrl from activity
4. ✅ Fixed JWT decoding (base64url)
5. ✅ Added WWW-Authenticate header logging
6. ✅ Added token caching
7. ✅ **ACK immediately, process async** (prevents Teams retries/timeouts)
8. ✅ Added bot registration verification logging

## Expected Behavior After All Fixes

1. ✅ Bot responds immediately (200 OK) to Teams
2. ✅ Processing happens in background (no timeout issues)
3. ✅ Token is correctly decoded (no random failures)
4. ✅ Better error messages if 401 occurs (WWW-Authenticate header)
5. ✅ Token is cached and reused (better performance)
6. ✅ Startup logs show CLIENT_ID for verification
7. ✅ Incoming activity logs show recipient.id for verification

## Final Verification Steps

If you still get 401 after all fixes:

1. **Check startup logs** - Verify CLIENT_ID matches:
   - Teams app manifest `botId`
   - Azure App Registration "Application (client) ID"

2. **Check incoming activity logs** - Verify `activity.recipient.id` matches your CLIENT_ID

3. **Check token payload** - Verify:
   - `aud = https://api.botframework.com` ✅
   - `appid/azp = your CLIENT_ID` ✅

4. **Check WWW-Authenticate header** - This will tell you the specific auth failure reason

If all of the above match and you still get 401, it's likely a configuration issue in Azure Bot Service or Teams app registration.

