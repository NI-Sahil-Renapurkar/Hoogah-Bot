# CloudAdapter ConnectorClient Fix (serviceUrl propagation)

## Problem
CloudAdapter threw: `Unable to extract ConnectorClient from turn context.`  
Cause: `serviceUrl` was not present on the request object it validates when running on Vercel.

## Fix (api/messages.ts)
- Added `serviceUrl` to the `webRequest` wrapper passed to `processActivity`.
- Also ensured `body.serviceUrl` is set for fallback.

### Updated webRequest block
```ts
const activity = req.body;

const webRequest: any = {
  body: activity,
  headers: req.headers,
  method: req.method,
  query: req.query,
  serviceUrl: activity?.serviceUrl,
};

if (activity && activity.serviceUrl) {
  webRequest.body.serviceUrl = activity.serviceUrl;
}
```

## Outcome
CloudAdapter can now create the ConnectorClient and send replies to Teams using the correct `serviceUrl` in the activity.

