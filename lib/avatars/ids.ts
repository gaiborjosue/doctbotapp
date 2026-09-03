export const AVATAR_IDS = [
  "grok-bot",
  "strobi",
  "freddy",
  "citrus",
  "nova",
  "sunee",
  "kirby",
  "cloudee",
  "cubee",
  "onee",
] as const

export type AvatarId = (typeof AVATAR_IDS)[number]

export const DEFAULT_AVATAR_ID: AvatarId = "grok-bot"

export function isAvatarId(value: unknown): value is AvatarId {
  return AVATAR_IDS.some((avatarId) => avatarId === value)
}
