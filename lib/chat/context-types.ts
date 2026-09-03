import type { LanguageModelUsage } from "ai"

export const DOCBOT_CONTEXT_TOKEN_LIMIT = 67_000
export const DOCBOT_CONTEXT_INPUT_TOKEN_BUDGET = 60_000
export const DOCBOT_CONTEXT_MIN_EXACT_MESSAGES = 20
export const DOCBOT_CONTEXT_MAX_EXACT_MESSAGES = 30

export type DocBotContextSnapshot = {
  compactedMessageCount: number
  exactMessageCount: number
  inputTokens: number
  inputTokensEstimated: boolean
  maxTokens: number
  summaryUpdatedAt?: string
  usedTokens: number
}

export type DocBotMessageMetadata = {
  context?: DocBotContextSnapshot
  createdAt?: string
  modelId?: string
  source?: "audio-summary"
  usage?: LanguageModelUsage
}

export function normalizeLanguageModelUsage(
  usage: LanguageModelUsage
): LanguageModelUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    inputTokenDetails: {
      cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
      noCacheTokens: usage.inputTokenDetails.noCacheTokens ?? 0,
    },
    outputTokens: usage.outputTokens ?? 0,
    outputTokenDetails: {
      reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? 0,
      textTokens: usage.outputTokenDetails.textTokens ?? 0,
    },
    totalTokens: usage.totalTokens ?? 0,
  }
}
