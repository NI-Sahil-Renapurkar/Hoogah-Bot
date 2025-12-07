# Hoogah Group Match Prototype - Changes Documentation

This document outlines all the changes made to implement the Hoogah Group Match Prototype bot with hardcoded questions.

## Project Structure

The bot follows the Microsoft 365 Agents Toolkit Simple Bot template structure with the following organization:

```
/src/
  ├── index.ts              # Entry point
  ├── app.ts                # HTTP server and app setup
  ├── bot.ts                # Bot conversation logic
  └── adaptiveCards/        # Adaptive card definitions
      ├── welcomeCard.json
      ├── question1.json
      ├── question2.json
      ├── question3.json
      └── finalMatchCard.json
```

## Files Created

### 1. `/src/index.ts`
**Purpose**: Application entry point

**Content**:
- Imports and starts the app
- Logs the port the bot is listening on

### 2. `/src/app.ts`
**Purpose**: HTTP server setup and Teams app configuration

**Key Features**:
- Creates LocalStorage for conversation history
- Initializes Teams App with storage
- Sets up bot logic via `setupBot()`
- Configures health check endpoint at `/`
- Implements `start()` method to launch HTTP server on port 3978 (or env var)

**HTTP Endpoints**:
- `GET /` - Health check endpoint
- `POST /api/messages` - Bot Framework messages (handled automatically by http plugin)

### 3. `/src/bot.ts`
**Purpose**: Core bot conversation logic

**Key Features**:
- In-memory state management per conversation ID
- Handles welcome card display on first message
- Processes adaptive card submit actions (both message and invoke activities)
- Sequential question flow: Q1 → Q2 → Q3 → Final Match
- Stores answers in memory: `q1`, `q2`, `q3`

**State Management**:
```typescript
interface UserState {
  q1?: string;
  q2?: string;
  q3?: string;
  hasStarted?: boolean;
}
```

**Event Handlers**:
- `app.on("message")` - Handles text messages and adaptive card submits via message activity
- `app.on("invoke")` - Handles adaptive card actions via invoke activity

### 4. `/src/adaptiveCards/welcomeCard.json`
**Purpose**: Welcome screen for new users

**Features**:
- Title: "Welcome to Hoogah! 🎉"
- Subtitle: "Let's get you matched."
- "Start" button with `Action.Submit`
- Action data: `{ type: "start" }`

### 5. `/src/adaptiveCards/question1.json`
**Purpose**: First matching question

**Question**: "What excites you most at events?"

**Options** (each as Action.Submit button):
- Networking
- Learning new things
- Meeting new people
- Deep conversations

**Action Data Format**:
```json
{
  "type": "answer",
  "questionId": 1,
  "value": "<selected option>"
}
```

### 6. `/src/adaptiveCards/question2.json`
**Purpose**: Second matching question

**Question**: "What is your communication style?"

**Options**:
- Direct
- Casual
- Friendly
- Reserved

**Action Data**: `{ type: "answer", questionId: 2, value: "<option>" }`

### 7. `/src/adaptiveCards/question3.json`
**Purpose**: Third matching question

**Question**: "How experienced are you in your field?"

**Options**:
- Beginner
- Intermediate
- Advanced
- Expert

**Action Data**: `{ type: "answer", questionId: 3, value: "<option>" }`

### 8. `/src/adaptiveCards/finalMatchCard.json`
**Purpose**: Display match result

**Features**:
- Title: "🎯 Match Found!"
- Message: "You are matched with: John Doe"
- "DM John Doe" button with `Action.OpenUrl`
- URL: `https://teams.microsoft.com/l/chat/0/0?users=john.doe@example.com` (placeholder)

## Conversation Flow

1. **User sends first message** (e.g., "hi")
   - Bot sends welcome card

2. **User clicks "Start" button**
   - Bot sends Question 1 card

3. **User selects answer for Question 1**
   - Answer stored in `state.q1`
   - Bot sends Question 2 card

4. **User selects answer for Question 2**
   - Answer stored in `state.q2`
   - Bot sends Question 3 card

5. **User selects answer for Question 3**
   - Answer stored in `state.q3`
   - Bot sends Final Match card

6. **User clicks "DM John Doe"**
   - Opens Teams chat (placeholder URL)

## Technical Implementation Details

### Adaptive Card Action Handling

The bot handles adaptive card actions in two ways:

1. **Message Activity with Value**:
   - When `activity.type === "message"` and `activity.value` exists
   - Extracts action data from `activity.value`

2. **Invoke Activity**:
   - When `activity.type === "invoke"` and `activity.name === "adaptiveCard/action"`
   - Extracts action data from `activity.value.action.data`

### State Management

- Uses in-memory `Record<string, UserState>` for state storage
- Key: `conversationId` from activity
- State persists for the lifetime of the Node.js process
- No external database or storage service required

### HTTP Server

- Uses Microsoft Teams Apps SDK's built-in HTTP plugin
- Automatically handles Bot Framework authentication
- `/api/messages` endpoint configured automatically
- Health check endpoint at `/` for monitoring

## Dependencies

No additional dependencies were added. The bot uses:
- `@microsoft/teams.apps` (v2.0.0) - Teams bot framework
- `@microsoft/teams.common` (v2.0.0) - Common utilities (LocalStorage)
- `@microsoft/teams.api` - Teams API types

## Build & Run

```bash
# Compile TypeScript
npm run build

# Start the bot
npm start
```

The bot will listen on:
- Port 3978 (default)
- Or `PORT`/`port` environment variable if set

## Testing

The bot responds to:
- **POST /api/messages** with Bot Framework activity payload:
  ```json
  {
    "type": "message",
    "text": "hi"
  }
  ```
- Adaptive card submit actions from all question cards
- Welcome card "Start" button action

## No External Services

As per requirements, the implementation uses:
- ✅ No OpenAI
- ✅ No Azure services (except SDK)
- ✅ No Microsoft Graph
- ✅ No databases
- ✅ All data hardcoded and stored in-memory

## Notes

- Match result is hardcoded to "John Doe"
- DM URL is a placeholder
- State is lost on server restart (in-memory only)
- All questions and options are hardcoded in JSON files

