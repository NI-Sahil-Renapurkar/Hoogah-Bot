# CloudAdapter processActivity Fix for Vercel (ZodError workaround)

## Problem
`CloudAdapter.process` expects Express/Restify response objects. On Vercel (Fetch API response), this caused a ZodError during validation.

## Fix (api/messages.ts)
- Stop calling `adapter.process`.
- Map env vars to Bot Framework names (unchanged):
  - `CLIENT_ID` → `MicrosoftAppId`
  - `CLIENT_SECRET` → `MicrosoftAppPassword`
  - `MS_TENANT_ID` → `MicrosoftAppTenantId`
  - `MicrosoftAppType = "SingleTenant"`
- Use `processActivity` with minimal wrapper objects:
  ```ts
  const activity = req.body;
  const webRequest = { body: activity, headers: req.headers, method: req.method, query: req.query };
  const webResponse = { statusCode: 200, set: () => {}, end: () => {}, send: () => {} };

  await (adapter as any).processActivity(webRequest as any, webResponse as any, async (turnContext: any) => {
    await runTeamsAppWithTurnContext(turnContext);
  });

  res.status(200).json({ ok: true });
  ```
- Adapter construction: `const adapter = new CloudAdapter();`
- Error handling: `adapter.onTurnError` sends “Oops, something went wrong.”

## Why this works
`processActivity` operates on plain WebRequest/WebResponse shapes. Supplying minimal shims avoids the Zod validation that was failing on Vercel’s response implementation.

## What to expect
- ZodError from `CloudAdapter.process` should be eliminated.
- Message flow remains: `/api/messages` → `processActivity` → `runTeamsAppWithTurnContext` → router → `turnContext.sendActivity`.

