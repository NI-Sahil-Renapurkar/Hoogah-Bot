import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CloudAdapter } from 'botbuilder';
import app, { runTeamsAppWithTurnContext } from '../src/app';

// Initialize app on first import
let appInitialized = false;

async function initializeApp() {
  if (!appInitialized) {
    console.log('Initializing app, router exists:', !!(app as any).router);
    appInitialized = true;
  }
  return app;
}

// Map existing env vars to Bot Framework standard names for the JS SDK.
const appId = process.env.CLIENT_ID ?? '';
const appPassword = process.env.CLIENT_SECRET ?? '';
const tenantId = process.env.MS_TENANT_ID ?? '';

process.env.MicrosoftAppId = appId;
process.env.MicrosoftAppPassword = appPassword;
process.env.MicrosoftAppType = "SingleTenant";
process.env.MicrosoftAppTenantId = tenantId;

// Construct CloudAdapter with env-based configuration (no arguments).
// Type definitions expect a BotFrameworkAuthentication, but the JS SDK supports env-based construction.
// @ts-expect-error CloudAdapter can read credentials from environment variables when no args are provided.
const adapter = new CloudAdapter();

// Global error handler
adapter.onTurnError = async (context, error) => {
  console.error('[bot] onTurnError', error);
  try {
    await context.sendActivity('Oops, something went wrong.');
  } catch (sendErr) {
    console.error('[bot] Failed to send error message', sendErr);
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[${new Date().toISOString()}] ${req.method} /api/messages`);

  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initializeApp();

  try {
    console.log('[adapter] processActivity start');

    const activity = req.body;

    const webRequest = {
      body: activity,
      headers: req.headers,
      method: req.method,
      query: req.query,
    };

    const webResponse = {
      statusCode: 200,
      set: () => {},
      end: () => {},
      send: () => {},
    };

    await (adapter as any).processActivity(webRequest as any, webResponse as any, async (turnContext: any) => {
      await runTeamsAppWithTurnContext(turnContext);
    });

    console.log('[adapter] processActivity end');
    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[adapter] processActivity error', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Bot processing error', message: err?.message });
    }
  }
}

