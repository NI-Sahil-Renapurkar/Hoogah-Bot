# CloudAdapter Auth Header Fix (ConnectorClient creation)

## Problem
Error: `Unable to extract ConnectorClient from turn context.`  
Cause: On Vercel, the inbound Authorization header can be missing/renamed, so CloudAdapter cannot build the ConnectorClient.

## Fix (api/messages.ts)
- Capture the auth header from possible locations: `authorization`, `Authorization`, `x-ms-bot-auth`.
- Inject it into both `headers.authorization` and `body.authorization` of the WebRequest passed to `processActivity`.
- Keep existing `serviceUrl` propagation.

### Updated WebRequest block
```ts
const activity = req.body;
const authHeader =
  (req.headers as any)["authorization"] ||
  (req.headers as any)["Authorization"] ||
  (req.headers as any)["x-ms-bot-auth"] ||
  null;

const webRequest: any = {
  body: activity,
  headers: {
    ...(req.headers as any),
    authorization: authHeader,
  },
  method: req.method,
  query: req.query,
  serviceUrl: activity?.serviceUrl,
};

if (activity && activity.serviceUrl) {
  webRequest.body.serviceUrl = activity.serviceUrl;
}

if (authHeader) {
  webRequest.body.authorization = authHeader;
}
```

## Outcome
CloudAdapter now receives the required Authorization header and serviceUrl, allowing it to construct the ConnectorClient and send replies to Teams.

