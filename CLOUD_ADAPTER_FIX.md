# CloudAdapter Import Fix (BotBuilder 4.22.x)

## What changed
- Removed `createBotFrameworkAuthenticationFromConfiguration` import (not exported in installed `botbuilder`).
- Constructed `CloudAdapter` directly with `ConfigurationServiceClientCredentialFactory`.

## Updated adapter setup (api/messages.ts)
- Imports:
  - `CloudAdapter`
  - `ConfigurationServiceClientCredentialFactory`
- Credentials:
  - `CLIENT_ID` → MicrosoftAppId
  - `CLIENT_SECRET` → MicrosoftAppPassword
  - `MS_TENANT_ID` → MicrosoftAppTenantId
  - `MicrosoftAppType: "SingleTenant"`
- Adapter:
  - `const adapter = new CloudAdapter(credentialsFactory);`
- Error handling:
  - `adapter.onTurnError` logs and sends “Oops, something went wrong.”
- Handler:
  - `adapter.process(req, res, turnContext => runTeamsAppWithTurnContext(turnContext));`

## Why
- The installed botbuilder version does not export `createBotFrameworkAuthenticationFromConfiguration`.
- Direct construction with the credentials factory is supported and keeps the adapter-based flow.

## Verification
- Type-check/lint passes (no linter errors).
- `/api/messages.ts` remains adapter-only; no manual token/send logic.
- `runTeamsAppWithTurnContext` continues to use `turnContext.sendActivity()`.

