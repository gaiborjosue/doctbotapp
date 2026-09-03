import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { LanguageModelUsage } from "ai"

import type { DocBotUIMessage } from "@/lib/agents/docbot-agent"
import type { DocBotContextSnapshot } from "@/lib/chat/context-types"
import { getCurrentDocBotReport } from "@/lib/reports/server"
import type { Database, Json } from "@/lib/supabase/database.types"

const DEFAULT_MESSAGE_LIMIT = 200
const MESSAGE_PAGE_SIZE = 250

export type DocBotSessionContext = {
  conversationSummary: string | null
  conversationSummaryMessageCount: number
  conversationSummaryThroughMessageId: number | null
  conversationSummaryUpdatedAt: string | null
  currentDocumentText: string | null
  documentRevisionNumber: number | null
  processingJobId: string
  sessionId: string
  sourceClinicalJson: string
  sourceContext: string
  title: string
  userId: string
}

export async function getDocBotSessionContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
): Promise<DocBotSessionContext | null> {
  const { data: session, error: sessionError } = await supabase
    .from("docbot_sessions")
    .select(
      "id, processing_job_id, title, user_id, conversation_summary, conversation_summary_message_count, conversation_summary_through_message_id, conversation_summary_updated_at"
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle()

  if (sessionError) {
    throw new Error("Unable to load the DocBot session.", {
      cause: sessionError,
    })
  }
  if (!session) return null

  const { data: processingJob, error: processingError } = await supabase
    .from("docbot_processing_jobs")
    .select("evidence_text, id, output_json, output_text, status")
    .eq("id", session.processing_job_id)
    .eq("user_id", userId)
    .maybeSingle()

  if (processingError) {
    throw new Error("Unable to load the session source context.", {
      cause: processingError,
    })
  }

  const sourceContext =
    processingJob?.evidence_text?.trim() ?? processingJob?.output_text?.trim()
  if (
    !processingJob ||
    processingJob.status !== "completed" ||
    !sourceContext
  ) {
    throw new Error("The session does not have a completed source summary.")
  }

  const report = await getCurrentDocBotReport(supabase, userId, session.id)

  return {
    conversationSummary: session.conversation_summary,
    conversationSummaryMessageCount: session.conversation_summary_message_count,
    conversationSummaryThroughMessageId:
      session.conversation_summary_through_message_id,
    conversationSummaryUpdatedAt: session.conversation_summary_updated_at,
    currentDocumentText: report?.documentText ?? null,
    documentRevisionNumber: report?.revisionNumber ?? null,
    processingJobId: processingJob.id,
    sessionId: session.id,
    sourceClinicalJson: JSON.stringify(
      processingJob.output_json ?? { resumen_original: sourceContext }
    ),
    sourceContext,
    title: session.title,
    userId: session.user_id,
  }
}

export async function getDocBotSessionMessages(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  limit = DEFAULT_MESSAGE_LIMIT
): Promise<DocBotUIMessage[]> {
  const { data, error } = await supabase
    .from("docbot_session_messages")
    .select("id, message_id, role, parts, metadata")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("id", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error("Unable to load the session messages.", { cause: error })
  }

  return data
    .reverse()
    .map(toStoredDocBotMessage)
    .map(({ message }) => message)
}

export type StoredDocBotSessionMessage = {
  message: DocBotUIMessage
  rowId: number
}

export async function getAllDocBotSessionMessages(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  afterRowId?: number | null
): Promise<StoredDocBotSessionMessage[]> {
  const messages: StoredDocBotSessionMessage[] = []
  let cursor = afterRowId ?? 0

  while (true) {
    const { data, error } = await supabase
      .from("docbot_session_messages")
      .select("id, message_id, role, parts, metadata")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(MESSAGE_PAGE_SIZE)

    if (error) {
      throw new Error("Unable to load the session messages.", { cause: error })
    }

    messages.push(...data.map(toStoredDocBotMessage))
    if (data.length < MESSAGE_PAGE_SIZE) return messages
    cursor = data.at(-1)?.id ?? cursor
  }
}

export async function updateDocBotConversationSummary({
  context,
  messageCount,
  summary,
  supabase,
  throughMessageId,
}: {
  context: DocBotSessionContext
  messageCount: number
  summary: string
  supabase: SupabaseClient<Database>
  throughMessageId: number
}) {
  const now = new Date().toISOString()
  let query = supabase
    .from("docbot_sessions")
    .update({
      conversation_summary: summary,
      conversation_summary_message_count: messageCount,
      conversation_summary_through_message_id: throughMessageId,
      conversation_summary_updated_at: now,
      updated_at: now,
    })
    .eq("id", context.sessionId)
    .eq("user_id", context.userId)

  query =
    context.conversationSummaryThroughMessageId === null
      ? query.is("conversation_summary_through_message_id", null)
      : query.eq(
          "conversation_summary_through_message_id",
          context.conversationSummaryThroughMessageId
        )

  const { data, error } = await query
    .select(
      "conversation_summary, conversation_summary_message_count, conversation_summary_through_message_id, conversation_summary_updated_at"
    )
    .maybeSingle()

  if (error) {
    throw new Error("Unable to persist the rolling conversation summary.", {
      cause: error,
    })
  }

  return data
}

export async function insertDocBotChatGenerationUsage({
  assistantMessageId,
  context,
  model,
  snapshot,
  stepCount,
  supabase,
  usage,
}: {
  assistantMessageId: string
  context: DocBotSessionContext
  model: string
  snapshot: DocBotContextSnapshot
  stepCount: number
  supabase: SupabaseClient<Database>
  usage: LanguageModelUsage
}) {
  const { error } = await supabase.from("docbot_chat_generations").insert({
    assistant_message_id: assistantMessageId,
    cache_read_tokens: usage.inputTokenDetails.cacheReadTokens,
    cache_write_tokens: usage.inputTokenDetails.cacheWriteTokens,
    compacted_message_count: snapshot.compactedMessageCount,
    context_input_tokens: snapshot.inputTokens,
    context_limit_tokens: snapshot.maxTokens,
    exact_message_count: snapshot.exactMessageCount,
    input_tokens: usage.inputTokens,
    model,
    output_tokens: usage.outputTokens,
    reasoning_tokens: usage.outputTokenDetails.reasoningTokens,
    session_id: context.sessionId,
    step_count: Math.max(1, stepCount),
    total_tokens: usage.totalTokens,
    user_id: context.userId,
  })

  if (error) {
    if (error.code === "23505") return false

    throw new Error("Unable to persist chat token usage.", { cause: error })
  }

  return true
}

export function createSourceSummaryMessage(
  context: DocBotSessionContext
): DocBotUIMessage {
  return {
    id: `source-${context.processingJobId}`,
    role: "assistant",
    metadata: { source: "audio-summary" },
    parts: [{ type: "text", text: context.sourceContext }],
  }
}

export async function insertDocBotSessionMessage(
  supabase: SupabaseClient<Database>,
  context: DocBotSessionContext,
  message: DocBotUIMessage
) {
  const { error } = await supabase.from("docbot_session_messages").insert({
    message_id: message.id,
    metadata: toJson(message.metadata ?? {}),
    parts: toJson(message.parts),
    role: message.role,
    session_id: context.sessionId,
    user_id: context.userId,
  })

  if (error) {
    if (error.code === "23505") return false

    throw new Error("Unable to persist the session message.", { cause: error })
  }

  return true
}

export async function updateDocBotSessionMessage(
  supabase: SupabaseClient<Database>,
  context: DocBotSessionContext,
  message: DocBotUIMessage
) {
  const { data, error } = await supabase
    .from("docbot_session_messages")
    .update({
      metadata: toJson(message.metadata ?? {}),
      parts: toJson(message.parts),
      updated_at: new Date().toISOString(),
    })
    .eq("message_id", message.id)
    .eq("session_id", context.sessionId)
    .eq("user_id", context.userId)
    .select("message_id")
    .maybeSingle()

  if (error) {
    throw new Error("Unable to update the session message.", { cause: error })
  }

  return Boolean(data)
}

function toStoredDocBotMessage(message: {
  id: number
  message_id: string
  metadata: Json
  parts: Json
  role: string
}): StoredDocBotSessionMessage {
  if (
    (message.role !== "user" && message.role !== "assistant") ||
    !Array.isArray(message.parts)
  ) {
    throw new Error("A stored chat message is invalid.")
  }

  const metadata =
    message.metadata &&
    typeof message.metadata === "object" &&
    !Array.isArray(message.metadata) &&
    Object.keys(message.metadata).length > 0
      ? message.metadata
      : undefined

  return {
    message: {
      id: message.message_id,
      role: message.role,
      ...(metadata ? { metadata } : {}),
      parts: message.parts,
    } as DocBotUIMessage,
    rowId: message.id,
  }
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}
