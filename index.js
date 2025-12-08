const express = require("express");
const { CloudAdapter } = require("botbuilder");
const { runTeamsAppWithTurnContext } = require("./lib/src/app");

// Ensure Bot Framework adapter env defaults
process.env.MicrosoftAppType = process.env.MicrosoftAppType || "SingleTenant";

const app = express();
app.use(express.json());

// Adapter reads credentials from MicrosoftApp* env vars
const adapter = new CloudAdapter();

adapter.onTurnError = async (context, error) => {
  console.error("[bot] onTurnError", error);
  try {
    await context.sendActivity("Oops, something went wrong.");
  } catch (sendErr) {
    console.error("[bot] Failed to send error message", sendErr);
  }
};

app.post("/api/messages", (req, res) => {
  adapter.process(req, res, async (turnContext) => {
    await runTeamsAppWithTurnContext(turnContext);
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

