# Hoogah Bot - Implementation Flow Documentation

This document explains the complete flow of how the Hoogah Bot works, from user input in the HTML interface to bot response rendering.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Complete Flow: "Hi" → Welcome Card](#complete-flow-hi--welcome-card)
3. [File Structure](#file-structure)
4. [Key Components](#key-components)
5. [State Management](#state-management)
6. [Adaptive Cards Flow](#adaptive-cards-flow)

---

## Architecture Overview

The bot consists of three main layers:

```
┌─────────────────────────────────────────┐
│  Frontend Layer (HTML/JavaScript)        │
│  - speakToBot.html                      │
│  - User interface & card rendering       │
└──────────────┬──────────────────────────┘
               │ HTTP POST /chat
               ▼
┌─────────────────────────────────────────┐
│  API Layer (Express/Node.js)            │
│  - app.ts: /chat endpoint               │
│  - Request parsing & response building  │
└──────────────┬──────────────────────────┘
               │ Activity Processing
               ▼
┌─────────────────────────────────────────┐
│  Bot Logic Layer (TypeScript)           │
│  - bot.ts: Conversation handlers        │
│  - Adaptive card definitions             │
│  - State management                      │
└─────────────────────────────────────────┘
```

---

## Complete Flow: "Hi" → Welcome Card

### Step 1: User Input in HTML Interface

**File:** `public/speakToBot.html` (lines 304-311)

**What Happens:**
- User types "Hi" in the input field
- User clicks "Send" button or presses Enter
- JavaScript function `sendMessage()` is triggered

**Code:**
```javascript
function sendMessage() {
    const text = messageInput.value.trim(); // Gets "Hi"
    addMessage(text, true); // Shows "Hi" in chat as user message
    // Displays typing indicator
    addTypingIndicator();
    // ...
}
```

**Visual Result:**
- User message bubble appears: "Hi"
- Typing indicator (three animated dots) appears

---

### Step 2: HTTP Request to Bot Server

**File:** `public/speakToBot.html` (lines 418-436)

**What Happens:**
- JavaScript makes a POST request to the bot's `/chat` endpoint
- Sends JSON payload with the user's text

**Code:**
```javascript
const response = await fetch('http://localhost:3978/chat', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: "Hi" }) // Sends: {"text": "Hi"}
});
```

**Request Details:**
- **URL:** `http://localhost:3978/chat`
- **Method:** POST
- **Headers:** `Content-Type: application/json`
- **Body:** `{"text": "Hi"}`

---

### Step 3: Express Server Receives Request

**File:** `src/app.ts` (lines 26-50)

**What Happens:**
- Express middleware intercepts the request
- JSON body parser middleware runs first
- Parses the JSON string into a JavaScript object

**Code:**
```typescript
// JSON body parser middleware
app.http.use((req: any, res: any, next: any) => {
  if (req.method === 'POST' && req.headers['content-type']?.includes('application/json')) {
    let data = '';
    req.on('data', (chunk: any) => { data += chunk.toString(); });
    req.on('end', () => {
      try {
        req.body = JSON.parse(data); // Now req.body = {text: "Hi"}
      } catch (e) {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
});
```

**Result:**
- `req.body` now contains: `{text: "Hi"}`

---

### Step 4: `/chat` Endpoint Handler Executes

**File:** `src/app.ts` (lines 54-56)

**What Happens:**
- The POST route handler for `/chat` is triggered
- Extracts the request body data

**Code:**
```typescript
app.http.post("/chat", async (req: any, res: any) => {
  try {
    const bodyData = req.body || {}; // {text: "Hi"}
    const responseMessages: any[] = []; // Array to collect bot responses
    // ...
```

**Initial State:**
- `bodyData = {text: "Hi"}`
- `responseMessages = []` (empty array, will be populated with bot responses)

---

### Step 5: Create Mock Bot Framework Activity

**File:** `src/app.ts` (lines 59-75)

**What Happens:**
- Creates a mock Bot Framework activity object
- This simulates what Microsoft Teams would send in a real scenario
- The activity includes conversation ID for state management

**Code:**
```typescript
const activity = {
  type: "message",
  text: (bodyData?.text || bodyData?.message || "hi") as string, // "Hi"
  id: `test-${Date.now()}`,
  from: {
    id: "test-user",
    name: "Test User"
  },
  conversation: {
    id: "test-conversation", // Used for state management
    conversationType: "personal"
  },
  channelId: "msteams",
  serviceUrl: "https://smba.trafficmanager.net/amer/",
  timestamp: new Date()
};
```

**Key Properties:**
- `activity.text = "Hi"` - The user's message
- `activity.conversation.id = "test-conversation"` - Used to track conversation state
- `activity.type = "message"` - Indicates this is a text message

---

### Step 6: Attempt to Trigger Bot Handlers

**File:** `src/app.ts` (lines 85-106)

**What Happens:**
- Tries to find and call registered message handlers from `bot.ts`
- In the test environment, handlers may not be accessible via router
- Falls back to manual logic if handlers aren't found

**Code:**
```typescript
// Trigger message handlers using the router
const router = (app as any).router;
let handlersCalled = false;

if (router && router.routes) {
  // Find the message route (routes is an array)
  const messageRoute = router.routes.find((r: any) => r.name === "message");
  if (messageRoute) {
    // Try different property names for handlers
    const handlers = messageRoute.handlers || messageRoute._handlers || messageRoute.callbacks || [];
    
    for (const handler of handlers) {
      try {
        await handler(mockContext);
        handlersCalled = true;
      } catch (e: any) {
        console.error("Handler error:", e.message);
      }
    }
  }
}
```

**Note:** In a real Microsoft Teams environment, the handlers in `bot.ts` would be called automatically. For the test endpoint, we use fallback logic.

---

### Step 7: Fallback Logic - Show Welcome Card

**File:** `src/app.ts` (lines 108-160)

**What Happens:**
- If handlers weren't called, manual logic determines the response
- Checks if this is a text message (not a button click)
- Loads and returns the welcome card

**Code:**
```typescript
// If still no handlers, manually trigger bot logic for testing
if (!handlersCalled) {
  // Import bot logic directly and call it
  const welcomeCard = require("./adaptiveCards/welcomeCard.json");
  
  // Handle button clicks (value object)
  if (bodyData.value?.type === "start") {
    // Handle start button click...
  } else if (bodyData.value?.type === "answer") {
    // Handle answer submissions...
  } else if (!bodyData.value && bodyData.text) {
    // Handle text messages - show welcome card for any text input
    responseMessages.push({
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        content: welcomeCard
      }]
    });
  }
}
```

**Logic Flow:**
1. Checks: `bodyData.value` exists? → NO (it's `undefined`)
2. Checks: `bodyData.text` exists? → YES (it's `"Hi"`)
3. Condition `!bodyData.value && bodyData.text` is TRUE
4. Loads `welcomeCard.json` from `src/adaptiveCards/`
5. Adds welcome card to `responseMessages` array

**Welcome Card Content:**
```json
{
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "Welcome to Hoogah! 🎉",
      "size": "Large",
      "weight": "Bolder"
    },
    {
      "type": "TextBlock",
      "text": "Let's get you matched.",
      "size": "Medium"
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Start",
      "data": {
        "type": "start"
      }
    }
  ]
}
```

---

### Step 8: Send JSON Response Back to Browser

**File:** `src/app.ts` (lines 161-170)

**What Happens:**
- Builds the final JSON response
- Includes success status, messages array, and received text
- Sends response back to the browser

**Code:**
```typescript
res.json({
  success: true,
  messages: responseMessages, // Contains welcome card
  received: activity.text // "Hi"
});
```

**Response Sent:**
```json
{
  "success": true,
  "messages": [
    {
      "type": "message",
      "attachments": [
        {
          "contentType": "application/vnd.microsoft.card.adaptive",
          "content": {
            "type": "AdaptiveCard",
            "version": "1.5",
            "body": [
              {
                "type": "TextBlock",
                "text": "Welcome to Hoogah! 🎉",
                "size": "Large",
                "weight": "Bolder"
              },
              {
                "type": "TextBlock",
                "text": "Let's get you matched.",
                "size": "Medium"
              }
            ],
            "actions": [
              {
                "type": "Action.Submit",
                "title": "Start",
                "data": {
                  "type": "start"
                }
              }
            ]
          }
        }
      ]
    }
  ],
  "received": "Hi"
}
```

---

### Step 9: HTML Receives and Processes Response

**File:** `public/speakToBot.html` (lines 438-456)

**What Happens:**
- JavaScript receives the JSON response
- Removes typing indicator
- Iterates through messages and attachments
- Calls render function for adaptive cards

**Code:**
```javascript
const data = await response.json(); // Gets the JSON response
removeTypingIndicator(); // Removes "typing..." animation

if (data.success && data.messages) {
  data.messages.forEach(msg => {
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach(attachment => {
        if (attachment.contentType === 'application/vnd.microsoft.card.adaptive') {
          renderAdaptiveCard(attachment.content); // Renders the card!
        }
      });
    }
  });
}
```

**Process:**
1. Parses JSON response
2. Checks `data.success === true`
3. Loops through `data.messages` array
4. Finds attachment with type `application/vnd.microsoft.card.adaptive`
5. Calls `renderAdaptiveCard()` with card content

---

### Step 10: Render Adaptive Card in UI

**File:** `public/speakToBot.html` (lines 374-420)

**What Happens:**
- Creates HTML elements for the adaptive card
- Renders text blocks as headings/paragraphs
- Creates interactive buttons
- Adds click handlers to buttons

**Code:**
```javascript
function renderAdaptiveCard(cardContent) {
  // Creates card container
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message bot';
  
  const cardDiv = document.createElement('div');
  cardDiv.className = 'adaptive-card';
  
  // Renders text blocks
  if (cardContent.body) {
    cardContent.body.forEach(item => {
      if (item.type === 'TextBlock') {
        const element = document.createElement(item.size === 'Large' ? 'h3' : 'p');
        element.textContent = item.text;
        if (item.size === 'Large' && item.weight === 'Bolder') {
          element.style.fontSize = '20px';
          element.style.fontWeight = 'bold';
          element.style.marginBottom = '10px';
        }
        cardDiv.appendChild(element);
      }
    });
  }
  
  // Renders buttons/actions
  if (cardContent.actions && cardContent.actions.length > 0) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'card-actions';
    
    cardContent.actions.forEach(action => {
      if (action.type === 'Action.Submit') {
        const button = document.createElement('button');
        button.className = 'card-button';
        button.textContent = action.title; // "Start"
        button.onclick = () => {
          sendAction(action.data); // When clicked, sends {"type": "start"}
        };
        actionsDiv.appendChild(button);
      }
    });
    
    cardDiv.appendChild(actionsDiv);
  }
  
  // Adds card to chat area
  messageDiv.appendChild(cardDiv);
  chatArea.appendChild(messageDiv);
  chatArea.scrollTop = chatArea.scrollHeight; // Auto-scroll to bottom
}
```

**Visual Result:**
- Card container appears with styling
- Large heading: "Welcome to Hoogah! 🎉"
- Medium text: "Let's get you matched."
- Purple gradient button: "Start"
- Button has click handler that will send `{"value": {"type": "start"}}`

---

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE LAYER                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  speakToBot.html                                      │   │
│  │  - User types "Hi"                                    │   │
│  │  - JavaScript: sendMessage()                          │   │
│  │  - POST /chat with {"text": "Hi"}                    │   │
│  └───────────────────────┬──────────────────────────────┘   │
└───────────────────────────┼───────────────────────────────────┘
                            │ HTTP POST
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API LAYER                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  src/app.ts                                          │   │
│  │  1. JSON Body Parser Middleware                      │   │
│  │     → Parses {"text": "Hi"}                         │   │
│  │                                                      │   │
│  │  2. /chat Endpoint Handler                          │   │
│  │     → Creates mock activity                         │   │
│  │     → Tries to call bot handlers                    │   │
│  │     → Falls back to manual logic                    │   │
│  │                                                      │   │
│  │  3. Manual Logic Check                              │   │
│  │     → bodyData.text exists? YES                     │   │
│  │     → Load welcomeCard.json                         │   │
│  │     → Add to responseMessages                       │   │
│  │                                                      │   │
│  │  4. Send JSON Response                              │   │
│  │     → {success: true, messages: [...], ...}        │   │
│  └───────────────────────┬──────────────────────────────┘   │
└───────────────────────────┼───────────────────────────────────┘
                            │ JSON Response
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE LAYER                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  speakToBot.html                                      │   │
│  │  - Receives JSON response                             │   │
│  │  - Calls renderAdaptiveCard()                         │   │
│  │  - Creates HTML elements                              │   │
│  │  - Renders card with "Start" button                   │   │
│  │  - Button click → sendAction({"type": "start"})      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
HoogahBot/
├── public/
│   └── speakToBot.html          # Web interface for testing
│
├── src/
│   ├── index.ts                 # Application entry point
│   ├── app.ts                   # HTTP server & /chat endpoint
│   ├── bot.ts                   # Bot conversation logic
│   └── adaptiveCards/
│       ├── welcomeCard.json     # Welcome screen card
│       ├── question1.json       # First question card
│       ├── question2.json       # Second question card
│       ├── question3.json       # Third question card
│       └── finalMatchCard.json  # Final match result card
│
└── lib/                         # Compiled JavaScript (from TypeScript)
```

---

## Key Components

### 1. Frontend (speakToBot.html)

**Responsibilities:**
- User interface rendering
- HTTP communication with bot
- Adaptive card rendering
- User interaction handling

**Key Functions:**
- `sendMessage()` - Sends text messages to bot
- `sendAction()` - Sends button clicks to bot
- `renderAdaptiveCard()` - Converts JSON card to HTML
- `addMessage()` - Adds message bubbles to chat

### 2. API Layer (app.ts)

**Responsibilities:**
- HTTP request handling
- JSON parsing
- Mock activity creation
- Response building

**Key Components:**
- JSON body parser middleware
- `/chat` POST endpoint
- Fallback logic for test environment
- Static file serving

### 3. Bot Logic (bot.ts)

**Responsibilities:**
- Conversation flow management
- State tracking per conversation
- Adaptive card selection
- Answer storage

**Key Functions:**
- `setupBot()` - Registers event handlers
- `getUserState()` - Gets/creates user state
- `sendNextQuestion()` - Determines next card to show

### 4. Adaptive Cards

**Structure:**
- JSON files defining card layout
- Text blocks for content
- Action buttons for interaction
- Data payloads for button clicks

---

## State Management

### Conversation State

**Storage:** In-memory object in `bot.ts`

```typescript
const userState: Record<string, UserState> = {};

interface UserState {
  q1?: string;        // Answer to question 1
  q2?: string;        // Answer to question 2
  q3?: string;        // Answer to question 3
  hasStarted?: boolean; // Has user seen welcome card?
}
```

**Key:** `conversationId` from activity
- Test environment: `"test-conversation"`
- Real Teams: Unique ID per conversation

**Flow:**
1. User sends "Hi" → `hasStarted = true`
2. User clicks "Start" → No state change, just shows Q1
3. User answers Q1 → `q1 = "Networking"`, shows Q2
4. User answers Q2 → `q2 = "Direct"`, shows Q3
5. User answers Q3 → `q3 = "Expert"`, shows final card

---

## Adaptive Cards Flow

### Card Types

1. **Welcome Card** (`welcomeCard.json`)
   - Triggered by: Any text message
   - Contains: Welcome message + "Start" button
   - Button sends: `{"type": "start"}`

2. **Question 1** (`question1.json`)
   - Triggered by: `{"type": "start"}` action
   - Contains: "What excites you most at events?"
   - Options: Networking, Learning, Meeting people, Deep conversations
   - Button sends: `{"type": "answer", "questionId": 1, "value": "..."}`

3. **Question 2** (`question2.json`)
   - Triggered by: Answer to Q1
   - Contains: "What is your communication style?"
   - Options: Direct, Casual, Friendly, Reserved
   - Button sends: `{"type": "answer", "questionId": 2, "value": "..."}`

4. **Question 3** (`question3.json`)
   - Triggered by: Answer to Q2
   - Contains: "How experienced are you in your field?"
   - Options: Beginner, Intermediate, Advanced, Expert
   - Button sends: `{"type": "answer", "questionId": 3, "value": "..."}`

5. **Final Match Card** (`finalMatchCard.json`)
   - Triggered by: Answer to Q3
   - Contains: "You are matched with: John Doe"
   - Button: "DM John Doe" (opens Teams chat)

### Button Click Flow

```
User clicks button
    ↓
sendAction(action.data) called
    ↓
POST /chat with {"value": action.data}
    ↓
Bot detects bodyData.value.type
    ↓
Stores answer (if question) or shows next card
    ↓
Returns new card in response
    ↓
HTML renders new card
```

---

## Important Notes

### 1. Two Code Paths

**Real Teams Environment:**
- Uses handlers registered in `bot.ts`
- `app.on("message")` and `app.on("invoke")` handle events
- State managed per conversation ID

**Test Environment (`/chat` endpoint):**
- Uses fallback logic in `app.ts`
- Manual card selection based on request body
- Simplified state management

### 2. Request Format Differences

**Text Message:**
```json
{"text": "Hi"}
```

**Button Click:**
```json
{"value": {"type": "start"}}
```

**Answer Submission:**
```json
{"value": {"type": "answer", "questionId": 1, "value": "Networking"}}
```

### 3. Response Format

All responses follow this structure:
```json
{
  "success": true,
  "messages": [
    {
      "type": "message",
      "attachments": [
        {
          "contentType": "application/vnd.microsoft.card.adaptive",
          "content": { /* Adaptive Card JSON */ }
        }
      ]
    }
  ],
  "received": "original input text"
}
```

---

## Testing the Flow

### Manual Testing Steps

1. **Start the bot:**
   ```bash
   npm start
   ```

2. **Open browser:**
   ```
   http://localhost:3978/speakToBot.html
   ```

3. **Test flow:**
   - Type "Hi" → Should see welcome card
   - Click "Start" → Should see Question 1
   - Click an answer → Should see Question 2
   - Continue through all questions
   - Final answer → Should see match card

### Using cURL

```bash
# Send "Hi"
curl -X POST http://localhost:3978/chat \
  -H "Content-Type: application/json" \
  -d '{"text": "Hi"}'

# Click Start button
curl -X POST http://localhost:3978/chat \
  -H "Content-Type: application/json" \
  -d '{"value": {"type": "start"}}'

# Answer Question 1
curl -X POST http://localhost:3978/chat \
  -H "Content-Type: application/json" \
  -d '{"value": {"type": "answer", "questionId": 1, "value": "Networking"}}'
```

---

## Summary

The bot flow is a request-response cycle:

1. **User Input** → HTML interface captures user action
2. **HTTP Request** → JavaScript sends POST to `/chat` endpoint
3. **Server Processing** → Express parses request, creates activity, determines response
4. **Card Selection** → Bot logic selects appropriate adaptive card
5. **JSON Response** → Server sends card data back to browser
6. **UI Rendering** → HTML renders adaptive card with interactive buttons
7. **Repeat** → User clicks button, cycle repeats

The entire flow is designed to work both in Microsoft Teams (using Bot Framework) and in a test environment (using the `/chat` endpoint).

