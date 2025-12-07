import { stripMentionsText } from "@microsoft/teams.api";
import { App } from "@microsoft/teams.apps";
import { Attachment } from "@microsoft/teams.api";
import welcomeCard from "./adaptiveCards/welcomeCard.json";
import question1Card from "./adaptiveCards/question1.json";
import question2Card from "./adaptiveCards/question2.json";
import question3Card from "./adaptiveCards/question3.json";
import finalMatchCard from "./adaptiveCards/finalMatchCard.json";

// In-memory state storage per conversation
interface UserState {
  q1?: string;
  q2?: string;
  q3?: string;
  hasStarted?: boolean;
}

const userState: Record<string, UserState> = {};

// Helper function to get or initialize user state
const getUserState = (conversationId: string): UserState => {
  if (!userState[conversationId]) {
    userState[conversationId] = {};
  }
  return userState[conversationId];
};

// Helper function to create adaptive card attachment
const createCardAttachment = (card: any): Attachment => {
  return {
    contentType: "application/vnd.microsoft.card.adaptive",
    content: card,
  };
};

// Helper function to send next question or final card
const sendNextQuestion = async (context: any, conversationId: string) => {
  const state = getUserState(conversationId);

  if (!state.q1) {
    // Send question 1
    await context.send({
      type: "message",
      attachments: [createCardAttachment(question1Card)],
    });
  } else if (!state.q2) {
    // Send question 2
    await context.send({
      type: "message",
      attachments: [createCardAttachment(question2Card)],
    });
  } else if (!state.q3) {
    // Send question 3
    await context.send({
      type: "message",
      attachments: [createCardAttachment(question3Card)],
    });
  } else {
    // All questions answered, send final pair card
    await context.send({
      type: "message",
      attachments: [createCardAttachment(finalMatchCard)],
    });
  }
};

// Setup bot logic
export const setupBot = (app: App) => {
  // Handle incoming messages
  app.on("message", async (context) => {
    const activity = context.activity;
    const conversationId = activity.conversation.id;
    const state = getUserState(conversationId);

    // Handle adaptive card submit actions (can come as message with value)
    if (activity.type === "message" && activity.value) {
      const value = activity.value as any;

      // Handle "start" action from welcome card
      if (value.type === "start") {
        await sendNextQuestion(context, conversationId);
        return;
      }

      // Handle answer submissions
      if (value.type === "answer" && value.questionId && value.value) {
        const questionId = value.questionId as number;
        const answer = value.value as string;

        // Store the answer
        if (questionId === 1) {
          state.q1 = answer;
        } else if (questionId === 2) {
          state.q2 = answer;
        } else if (questionId === 3) {
          state.q3 = answer;
        }

        // Send next question or final card
        await sendNextQuestion(context, conversationId);
        return;
      }
    }

    // Check if this is a text message (first interaction or restart)
    if (activity.type === "message" && activity.text) {
      const text: string = stripMentionsText(activity).toLowerCase().trim();

      // If user has completed all questions and sends "hi" or similar, reset and restart
      if (state.q1 && state.q2 && state.q3) {
        if (text === "hi" || text === "hello" || text === "hey" || text === "start" || text === "restart" || text === "begin") {
          // Reset state to start fresh
          delete userState[conversationId];
          const resetState = getUserState(conversationId);
          resetState.hasStarted = true;
          await context.send({
            type: "message",
            attachments: [createCardAttachment(welcomeCard)],
          });
          return;
        }
      }

      // If user hasn't started, send welcome card
      if (!state.hasStarted) {
        state.hasStarted = true;
        await context.send({
          type: "message",
          attachments: [createCardAttachment(welcomeCard)],
        });
        return;
      }
    }
  });

  // Handle adaptive card invoke actions
  app.on("invoke", async (context) => {
    const activity = context.activity;
    
    // Handle adaptive card actions
    if (activity.type === "invoke" && activity.name === "adaptiveCard/action") {
      const conversationId = activity.conversation?.id;
      if (!conversationId) {
        return;
      }

      const state = getUserState(conversationId);
      const actionData = activity.value?.action as any;

      if (actionData?.type === "Action.Submit" && actionData.data) {
        const data = actionData.data;

        // Handle "start" action from welcome card
        if (data.type === "start") {
          await sendNextQuestion(context, conversationId);
          return;
        }

        // Handle answer submissions
        if (data.type === "answer" && data.questionId && data.value) {
          const questionId = data.questionId as number;
          const answer = data.value as string;

          // Store the answer
          if (questionId === 1) {
            state.q1 = answer;
          } else if (questionId === 2) {
            state.q2 = answer;
          } else if (questionId === 3) {
            state.q3 = answer;
          }

          // Send next question or final card
          await sendNextQuestion(context, conversationId);
          return;
        }
      }
    }
  });
};

