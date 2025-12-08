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
    console.log('[adapter] process start');
    await adapter.process(req as any, res as any, async (turnContext) => {
      await runTeamsAppWithTurnContext(turnContext);
    });
    console.log('[adapter] process end');
  } catch (err: any) {
    console.error('[adapter] process error', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Bot processing error', message: err?.message });
    }
  }
}

