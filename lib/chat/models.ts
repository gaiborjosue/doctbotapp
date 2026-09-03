export const DOCBOT_CHAT_MODEL_IDS = [
  "google/gemini-2.5-flash",
  "inception/mercury-2.5",
] as const

export type DocBotChatModelId = (typeof DOCBOT_CHAT_MODEL_IDS)[number]

export const DEFAULT_DOCBOT_CHAT_MODEL_ID: DocBotChatModelId =
  "google/gemini-2.5-flash"

export const MERCURY_CHAT_MODEL_ID: DocBotChatModelId =
  "inception/mercury-2.5"

export const DOCBOT_CHAT_MODEL_OPTIONS = [
  {
    label: "Gemini 2.5 Flash",
    shortLabel: "Gemini 2.5",
    value: DEFAULT_DOCBOT_CHAT_MODEL_ID,
  },
  {
    label: "Mercury 2.5",
    shortLabel: "Mercury 2.5",
    value: MERCURY_CHAT_MODEL_ID,
  },
] satisfies ReadonlyArray<{
  label: string
  shortLabel: string
  value: DocBotChatModelId
}>

export function isDocBotChatModelId(
  value: unknown
): value is DocBotChatModelId {
  return DOCBOT_CHAT_MODEL_IDS.some((modelId) => modelId === value)
}

export function getDocBotChatModelOption(modelId: DocBotChatModelId) {
  return DOCBOT_CHAT_MODEL_OPTIONS.find((option) => option.value === modelId)!
}
