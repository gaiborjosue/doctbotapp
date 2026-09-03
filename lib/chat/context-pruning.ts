import { pruneMessages, type ModelMessage } from "ai"

export function pruneDocBotModelMessages(messages: ModelMessage[]) {
  return pruneMessages({
    emptyMessages: "remove",
    messages,
    reasoning: "before-last-message",
    toolCalls: "before-last-2-messages",
  })
}
