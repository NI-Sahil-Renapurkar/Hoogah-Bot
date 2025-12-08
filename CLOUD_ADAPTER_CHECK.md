# CloudAdapter Consistency Check (Post-Refactor)

## Scope
Quick verification after switching to the Bot Framework CloudAdapter (removal of manual axios token/send logic).

## What Was Verified
- `/api/messages.ts` uses CloudAdapter with `createBotFrameworkAuthenticationFromConfiguration` and env-based credentials.
- Adapter handles auth; handler just calls `adapter.process()` then `runTeamsAppWithTurnContext()`.
- `runTeamsAppWithTurnContext` (in `src/app.ts`) sends via `turnContext.sendActivity()` and preserves router.select plus fallback handlers.
- No remaining manual token/send code or calls to `login.microsoftonline.com` in TypeScript sources.

## Current Adapter Setup (summary)
- Credentials: `CLIENT_ID` → MicrosoftAppId, `CLIENT_SECRET` → MicrosoftAppPassword, `MS_TENANT_ID` → MicrosoftAppTenantId, `MicrosoftAppType: "SingleTenant"`.
- Error handling: `adapter.onTurnError` logs and sends “Oops, something went wrong.”
- Handler flow: `adapter.process(req, res, turnContext => runTeamsAppWithTurnContext(turnContext));`

## File Touchpoints
- `api/messages.ts` — adapter configuration and entrypoint.
- `src/app.ts` — router bridge via `runTeamsAppWithTurnContext`.

## Sanity Checklist
- [x] No `getBotFrameworkToken` in `.ts` sources
- [x] No `sendToConversation` in `.ts` sources
- [x] No `login.microsoftonline.com` in `.ts` sources
- [x] `/api/messages` handler is adapter-only
- [x] `context.send` calls `turnContext.sendActivity`

## Expected Runtime Flow
Teams → `/api/messages` → CloudAdapter → `runTeamsAppWithTurnContext` → router.select/handlers → `context.send` → `turnContext.sendActivity` → Teams reply (welcome card).

