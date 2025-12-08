# Bot Framework Adapter Refactoring - Changes Summary

## Problem Statement

The bot was using **manual axios-based token acquisition and HTTP calls** to send replies to Teams:
- Custom `getBotFrameworkToken()` function making POST requests to `login.microsoftonline.com`
- Custom `sendToConversation()` function making POST requests to `serviceUrl/v3/conversations/.../activities`
- Manual token caching and error handling
- **Result**: Fragile, error-prone, and Teams wasn't receiving replies reliably

## Solution: Use Official Bot Framework CloudAdapter

Refactored to use the **official Bot Framework SDK's `CloudAdapter`** which handles:
- OAuth token acquisition automatically
- Sending replies to Teams via Bot Framework Connector
- Authentication and retry logic
- All HTTP communication with Microsoft services

## Files Changed

### 1. `/api/messages.ts` - Complete Rewrite

**Before:**
- Manual env var reading and validation
- Custom `getBotFrameworkToken()` function (200+ lines)
- Custom `sendToConversation()` function (70+ lines)
- Manual context creation with custom `send()` function
- Manual router invocation

**After:**
- Uses `CloudAdapter` from `botbuilder` package
- Uses `ConfigurationServiceClientCredentialFactory` for credentials
- `adapter.process(req, res, async (turnContext) => {...})` pattern
- Calls `runTeamsAppWithTurnContext(turnContext)` to run existing router
- **Removed**: All manual token/send logic (270+ lines deleted)

**Key Code:**
```typescript
import { CloudAdapter, ConfigurationServiceClientCredentialFactory } from 'botbuilder';

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.CLIENT_ID || '',
  MicrosoftAppPassword: process.env.CLIENT_SECRET || '',
  MicrosoftAppTenantId: process.env.MS_TENANT_ID,
});

const adapter = new CloudAdapter(credentialsFactory);

adapter.onTurnError = async (context, error) => {
  console.error('[bot] onTurnError', error);
  await context.sendActivity('Oops, something went wrong.');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await adapter.process(req as any, res as any, async (turnContext) => {
    await runTeamsAppWithTurnContext(turnContext);
  });
}
```

### 2. `/src/app.ts` - Added Router Integration Function

**Added:**
- New exported function `runTeamsAppWithTurnContext(turnContext: TurnContext)`
- Bridges Teams AI router with Bot Framework `TurnContext`
- Creates a `context` object with `send()` that calls `turnContext.sendActivity()`
- Preserves existing router.select() and router.routes fallback logic

**Key Code:**
```typescript
import { TurnContext } from "botbuilder";

export async function runTeamsAppWithTurnContext(turnContext: TurnContext): Promise<void> {
  const activity = turnContext.activity;
  const router = (app as any).router;
  
  const context: any = {
    activity,
    send: async (response: any) => {
      const responseActivity = { type: "message", ...response };
      await turnContext.sendActivity(responseActivity);
    },
  };
  
  // Use existing router.select() logic
  if (typeof router.select === 'function') {
    const routes = router.select(activity) || [];
    for (const route of routes) {
      await route(context);
    }
  }
}
```

**Removed:**
- All token-related helper functions (`getBotFrameworkToken`, `sendToConversation`, `decodeJwtPayload`)
- Token cache (`tokenCacheByTenant`)
- Manual `/api/messages` endpoint (now handled by adapter in Vercel route)

### 3. `/package.json` - Added Dependency

**Added:**
```json
"botbuilder": "^4.22.2"
```

This is the official Bot Framework SDK package that provides `CloudAdapter` and `TurnContext`.

### 4. `/api/botbuilder-shim.d.ts` - Type Definitions (Temporary)

**Created:**
- Type declaration file to satisfy TypeScript until `npm install` runs
- Provides minimal type definitions for `botbuilder` module
- Will be replaced by actual types after `npm install`

## Architecture Changes

### Before (Manual Approach)
```
Teams → /api/messages → Manual token fetch → Manual POST to serviceUrl
                         ↓
                    getBotFrameworkToken()
                         ↓
                    axios.post(login.microsoftonline.com)
                         ↓
                    sendToConversation()
                         ↓
                    axios.post(serviceUrl/v3/conversations/...)
```

### After (Adapter Approach)
```
Teams → /api/messages → CloudAdapter.process()
                         ↓
                    Adapter handles OAuth automatically
                         ↓
                    Adapter sends via Bot Framework Connector
                         ↓
                    runTeamsAppWithTurnContext()
                         ↓
                    Router selects handler → context.send()
                         ↓
                    turnContext.sendActivity() (adapter handles HTTP)
```

## Environment Variables (Unchanged)

The same env vars are used, just mapped differently:
- `CLIENT_ID` → `MicrosoftAppId` (Bot Framework App ID)
- `CLIENT_SECRET` → `MicrosoftAppPassword` (Bot Framework App Password)
- `MS_TENANT_ID` → `MicrosoftAppTenantId` (Optional, for tenant-specific auth)

## Verification Checklist

To verify the changes were made correctly:

### 1. Check `/api/messages.ts`
- [ ] Imports `CloudAdapter` and `ConfigurationServiceClientCredentialFactory` from `botbuilder`
- [ ] Creates `credentialsFactory` with env vars
- [ ] Creates `adapter` instance
- [ ] Sets `adapter.onTurnError` handler
- [ ] Handler calls `adapter.process(req, res, async (turnContext) => {...})`
- [ ] Inside process callback, calls `runTeamsAppWithTurnContext(turnContext)`
- [ ] **NO** `getBotFrameworkToken()` function
- [ ] **NO** `sendToConversation()` function
- [ ] **NO** manual axios calls to `login.microsoftonline.com`
- [ ] **NO** manual axios calls to `serviceUrl/v3/conversations/...`

### 2. Check `/src/app.ts`
- [ ] Exports `runTeamsAppWithTurnContext(turnContext: TurnContext)` function
- [ ] Function creates a `context` object with `send()` method
- [ ] `context.send()` calls `turnContext.sendActivity()`
- [ ] Function uses existing `router.select()` logic
- [ ] **NO** `getBotFrameworkToken()` function
- [ ] **NO** `sendToConversation()` function
- [ ] **NO** token cache or JWT decoding functions

### 3. Check `/package.json`
- [ ] Has `"botbuilder": "^4.22.2"` in dependencies

### 4. Check Logging
- [ ] `/api/messages.ts` logs `[adapter] process start` and `[adapter] process end`
- [ ] `/src/app.ts` logs `[router]` prefixed messages
- [ ] Error logging via `adapter.onTurnError`

## Expected Behavior After Deployment

1. **When Teams sends "Hi":**
   - `/api/messages` receives POST
   - `adapter.process()` authenticates automatically (no manual token calls)
   - `runTeamsAppWithTurnContext()` runs router
   - Router selects message handler
   - Handler calls `context.send({ attachments: [welcomeCard] })`
   - `turnContext.sendActivity()` sends via adapter
   - **Welcome card appears in Teams**

2. **Logs should show:**
   ```
   [adapter] process start
   [adapter] Incoming activity { type: 'message', channelId: 'msteams', ... }
   [router] Activity type: message
   [router] Routes selected: 1
   📤 context.send() via adapter!
   [adapter] process end
   ```

3. **No manual token/send logs:**
   - Should NOT see `[token] Making token request...`
   - Should NOT see `[send] Preparing to send response...`
   - Should NOT see any axios calls to `login.microsoftonline.com`

## Next Steps

1. Run `npm install` to install `botbuilder` package
2. Deploy to Vercel
3. Test by sending "Hi" in Teams
4. Verify welcome card appears
5. Check Vercel logs for adapter-based flow (not manual token/send)

## Rollback Plan

If issues occur, the previous manual implementation can be restored from git history. The key files to restore:
- `/api/messages.ts` - previous version with `getBotFrameworkToken()` and `sendToConversation()`
- `/src/app.ts` - previous version with token helper functions

