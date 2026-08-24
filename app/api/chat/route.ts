import {
  consumeStream,
  createAgentUIStreamResponse,
  createIdGenerator,
} from "ai"
import { z } from "zod"

import {
  docBotAgent,
  GEMINI_CHAT_MODEL_ID,
  type DocBotUIMessage,
} from "@/lib/agents/docbot-agent"
import { isValidDocumentApprovalResponse } from "@/lib/chat/approval"
import {
  DocBotContextBudgetError,
  prepareDocBotContextWindow,
} from "@/lib/chat/context-window"
import {
  normalizeLanguageModelUsage,
  type DocBotContextSnapshot,
  type DocBotMessageMetadata,
} from "@/lib/chat/context-types"
import {
  getDocBotSessionContext,
  getDocBotSessionMessages,
  insertDocBotChatGenerationUsage,
  insertDocBotSessionMessage,
  updateDocBotSessionMessage,
} from "@/lib/chat/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

const textPartSchema = z.object({
  text: z.string().min(1).max(12_000),
  type: z.literal("text"),
})

const chatRequestSchema = z.object({
  message: z.unknown(),
  sessionId: z.string().uuid(),
})

const userMessageSchema = z.object({
  id: z.string().min(1).max(128),
  parts: z.array(textPartSchema).min(1).max(4),
  role: z.literal("user"),
})

const assistantApprovalMessageSchema = z.object({
  id: z.string().min(1).max(128),
  metadata: z.unknown().optional(),
  parts: z.array(z.unknown()).min(1).max(64),
  role: z.literal("assistant"),
})

const generateMessageId = createIdGenerator({ prefix: "msg", size: 24 })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  try {
    const requestBody = await request.json().catch(() => undefined)
    const parsedRequest = chatRequestSchema.safeParse(requestBody)
    if (!parsedRequest.success) {
      return Response.json(
        { error: "The chat request is invalid." },
        { status: 400 }
      )
    }

    const { message: rawRequestMessage, sessionId } = parsedRequest.data

    const context = await getDocBotSessionContext(
      supabase,
      claims.sub,
      sessionId
    )
    if (!context) {
      return Response.json({ error: "Session not found." }, { status: 404 })
    }

    const previousMessages = await getDocBotSessionMessages(
      supabase,
      claims.sub,
      sessionId
    )
    let conversationMessages: DocBotUIMessage[]
    const parsedUserMessage = userMessageSchema.safeParse(rawRequestMessage)

    if (parsedUserMessage.success) {
      const requestMessage = parsedUserMessage.data
      const content = requestMessage.parts
        .map((part) => part.text.trim())
        .filter(Boolean)
        .join("\n")
        .trim()

      if (!content || content.length > 12_000) {
        return Response.json(
          { error: "The message must contain 12,000 characters or fewer." },
          { status: 400 }
        )
      }
      if (
        previousMessages.some((message) => message.id === requestMessage.id)
      ) {
        return Response.json(
          { error: "This message has already been submitted." },
          { status: 409 }
        )
      }

      const userMessage: DocBotUIMessage = {
        id: requestMessage.id,
        role: "user",
        parts: [{ type: "text", text: content }],
      }
      const inserted = await insertDocBotSessionMessage(
        supabase,
        context,
        userMessage
      )
      if (!inserted) {
        return Response.json(
          { error: "This message has already been submitted." },
          { status: 409 }
        )
      }

      conversationMessages = [...previousMessages, userMessage]
    } else {
      const parsedApprovalMessage =
        assistantApprovalMessageSchema.safeParse(rawRequestMessage)
      if (!parsedApprovalMessage.success) {
        return Response.json(
          { error: "The chat request is invalid." },
          { status: 400 }
        )
      }

      const approvalMessage = parsedApprovalMessage.data as DocBotUIMessage
      const storedMessage = previousMessages.find(
        (message) => message.id === approvalMessage.id
      )
      if (
        !storedMessage ||
        storedMessage.role !== "assistant" ||
        !isValidDocumentApprovalResponse(storedMessage, approvalMessage)
      ) {
        return Response.json(
          { error: "The document approval response is invalid." },
          { status: 400 }
        )
      }

      const updated = await updateDocBotSessionMessage(
        supabase,
        context,
        approvalMessage
      )
      if (!updated) {
        return Response.json(
          { error: "The approval request no longer exists." },
          { status: 409 }
        )
      }

      conversationMessages = previousMessages.map((message) =>
        message.id === approvalMessage.id ? approvalMessage : message
      )
    }

    const preparedContext = await prepareDocBotContextWindow({
      context,
      supabase,
    })
    let completedUsage: ReturnType<typeof normalizeLanguageModelUsage> | null =
      null
    let completedSnapshot: DocBotContextSnapshot = preparedContext.snapshot
    let maxStepInputTokens = 0
    let maxStepTotalTokens = 0
    let stepCount = 0
    const publicModelId = `google/${GEMINI_CHAT_MODEL_ID}`

    return await createAgentUIStreamResponse({
      agent: docBotAgent,
      uiMessages: preparedContext.messages,
      originalMessages: conversationMessages,
      options: preparedContext.callOptions,
      onStepEnd: ({ usage }) => {
        stepCount += 1
        const inputTokens = usage.inputTokens ?? 0
        const totalTokens =
          usage.totalTokens ?? inputTokens + (usage.outputTokens ?? 0)
        maxStepInputTokens = Math.max(maxStepInputTokens, inputTokens)
        maxStepTotalTokens = Math.max(maxStepTotalTokens, totalTokens)
      },
      generateMessageId,
      consumeSseStream: consumeStream,
      headers: { "Cache-Control": "private, no-store" },
      sendReasoning: true,
      messageMetadata: ({ part }): DocBotMessageMetadata | undefined => {
        if (part.type !== "finish") return undefined

        completedUsage = normalizeLanguageModelUsage(part.totalUsage)
        completedSnapshot = {
          ...preparedContext.snapshot,
          inputTokens:
            maxStepInputTokens || preparedContext.snapshot.inputTokens,
          inputTokensEstimated: maxStepInputTokens === 0,
          usedTokens: maxStepTotalTokens || preparedContext.snapshot.usedTokens,
        }

        return {
          context: completedSnapshot,
          createdAt: new Date().toISOString(),
          modelId: publicModelId,
          usage: completedUsage,
        }
      },
      onEnd: async ({ finishReason, isAborted, responseMessage }) => {
        if (isAborted || finishReason === "error") return

        const persistedMessage: DocBotUIMessage = {
          ...responseMessage,
          metadata: {
            ...responseMessage.metadata,
            context: completedSnapshot,
            createdAt:
              responseMessage.metadata?.createdAt ?? new Date().toISOString(),
            modelId: publicModelId,
            ...(completedUsage ? { usage: completedUsage } : {}),
          },
        }
        const inserted = await insertDocBotSessionMessage(
          supabase,
          context,
          persistedMessage
        )
        if (!inserted) {
          await updateDocBotSessionMessage(supabase, context, persistedMessage)
        }

        if (completedUsage) {
          try {
            await insertDocBotChatGenerationUsage({
              assistantMessageId: persistedMessage.id,
              context,
              model: GEMINI_CHAT_MODEL_ID,
              snapshot: completedSnapshot,
              stepCount,
              supabase,
              usage: completedUsage,
            })
          } catch (error) {
            console.error("[api/chat] unable to persist token usage", {
              message: error instanceof Error ? error.message : String(error),
              sessionId,
            })
          }
        }
      },
      onError: (error) => {
        console.error("[api/chat] Gemini stream failed", {
          message: error instanceof Error ? error.message : String(error),
          sessionId,
        })

        return "DocBot could not complete the response. Please try again."
      },
    })
  } catch (error) {
    if (error instanceof DocBotContextBudgetError) {
      return Response.json({ error: error.message }, { status: 413 })
    }

    console.error("[api/chat] failed", {
      message: error instanceof Error ? error.message : String(error),
    })

    return Response.json(
      { error: "DocBot could not start the response." },
      { status: 500 }
    )
  }
}
