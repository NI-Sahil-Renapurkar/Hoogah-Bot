# Testing the Hoogah Bot

## Quick Start

1. **Build the bot:**
   ```bash
   npm run build
   ```

2. **Start the bot:**
   ```bash
   npm start
   ```
   The bot will start on port 3978 (or the PORT environment variable).

3. **Test the bot** (in another terminal):
   ```bash
   curl -X POST http://localhost:3978/chat \
     -H "Content-Type: application/json" \
     -d '{"text": "Hi"}'
   ```

## Endpoints

### Health Check
```bash
curl http://localhost:3978/
```
Returns: "Bot is running!"

### Test Chat Endpoint
```bash
curl -X POST http://localhost:3978/chat \
  -H "Content-Type: application/json" \
  -d '{"text": "Hi"}'
```

**Response format:**
```json
{
  "success": true,
  "messages": [
    {
      "type": "message",
      "attachments": [...]
    }
  ],
  "received": "Hi"
}
```

### Bot Framework Endpoint (for Teams)
```bash
curl -X POST http://localhost:3978/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "type": "message",
    "text": "hi",
    "from": {"id": "user1", "name": "User"},
    "conversation": {"id": "conv1"},
    "channelId": "msteams"
  }'
```

## Troubleshooting

### "Cannot POST /chat" Error
- Make sure the bot is running: `npm start`
- Make sure you rebuilt after adding the endpoint: `npm run build`
- Check if port 3978 is in use: `lsof -i :3978`

### Bot Not Responding
- Check the bot console for errors
- Verify the bot is listening: `curl http://localhost:3978/`
- Make sure the bot process is running: `ps aux | grep node`

### Restart the Bot
1. Stop the current process (Ctrl+C or kill the process)
2. Rebuild: `npm run build`
3. Start: `npm start`






