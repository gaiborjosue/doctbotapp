import { AVATAR_IDS, DEFAULT_AVATAR_ID, isAvatarId } from "@/lib/avatars/ids"
import type { AvatarColorOverrides } from "@/lib/avatars/registry"

export const MAX_USERNAME_LENGTH = 20
export const MIN_USERNAME_LENGTH = 3

export type DocBotProfile = {
  avatarId: (typeof AVATAR_IDS)[number]
  avatarColors: AvatarColorOverrides
  username: string
}

export const DEFAULT_DOCBOT_PROFILE: DocBotProfile = {
  avatarId: DEFAULT_AVATAR_ID,
  avatarColors: {},
  username: "",
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
}

export function normalizeAvatarColors(value: unknown): AvatarColorOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const storedColors = value as Record<string, unknown>
  const normalizedColors: AvatarColorOverrides = {}

  for (const avatarId of AVATAR_IDS) {
    const candidate = storedColors[avatarId]
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      continue
    }

    const colors = candidate as Record<string, unknown>
    if (!isHexColor(colors.body) || !isHexColor(colors.eyes)) continue

    normalizedColors[avatarId] = {
      body: colors.body.toLowerCase(),
      eyes: colors.eyes.toLowerCase(),
    }
  }

  return normalizedColors
}

function normalizeUsername(value: unknown, fallbackUsername = "") {
  const username = typeof value === "string" ? value.trim() : ""
  const fallback = fallbackUsername.trim()
  const candidate =
    username.length >= MIN_USERNAME_LENGTH
      ? username
      : fallback.length >= MIN_USERNAME_LENGTH
        ? fallback
        : ""

  return candidate.slice(0, MAX_USERNAME_LENGTH)
}

export function normalizeDocBotProfile(
  value:
    | {
        avatarId?: unknown
        avatarColors?: unknown
        username?: unknown
      }
    | null
    | undefined,
  fallbackUsername = ""
): DocBotProfile {
  return {
    avatarId: isAvatarId(value?.avatarId) ? value.avatarId : DEFAULT_AVATAR_ID,
    avatarColors: normalizeAvatarColors(value?.avatarColors),
    username: normalizeUsername(value?.username, fallbackUsername),
  }
}
