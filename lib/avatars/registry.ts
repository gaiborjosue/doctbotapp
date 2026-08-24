import {
  createAvatar,
  type CreatedAvatarComponent,
} from "@bible-strong/avatar-react"

import citrusDefinition from "@/lib/avatars/definitions/citrus.avatar.json"
import cloudeeDefinition from "@/lib/avatars/definitions/cloudee.avatar.json"
import cubeeDefinition from "@/lib/avatars/definitions/cubee.avatar.json"
import freddyDefinition from "@/lib/avatars/definitions/freddy.avatar.json"
import grokBotDefinition from "@/lib/avatars/definitions/grok-bot.avatar.json"
import kirbyDefinition from "@/lib/avatars/definitions/kirby.avatar.json"
import novaDefinition from "@/lib/avatars/definitions/nova.avatar.json"
import oneeDefinition from "@/lib/avatars/definitions/onee.avatar.json"
import strobiDefinition from "@/lib/avatars/definitions/strobi.avatar.json"
import suneeDefinition from "@/lib/avatars/definitions/sunee.avatar.json"
import { DEFAULT_AVATAR_ID, isAvatarId, type AvatarId } from "@/lib/avatars/ids"

export { DEFAULT_AVATAR_ID, isAvatarId, type AvatarId }

type TintableExpression = {
  colors?: { body?: string; eyes?: string }
  [key: string]: unknown
}

export type AvatarDefinitionJson = {
  name: string
  colors: { body: string; eyes: string }
  expressions: Record<string, TintableExpression>
  animations: Record<string, unknown>
  [key: string]: unknown
}

export type AvatarRenderer = CreatedAvatarComponent<AvatarDefinitionJson>

function createAvatarOption<const Id extends string>(
  id: Id,
  definition: AvatarDefinitionJson
) {
  return {
    id,
    name: definition.name,
    definition,
    Avatar: createAvatar(definition),
    SuccessAvatar: createTintedAvatar(definition, "#4f9f64", "#14331e"),
    FailureAvatar: createTintedAvatar(definition, "#b65353", "#451b1b"),
  }
}

export const AVATAR_OPTIONS = [
  createAvatarOption("grok-bot", grokBotDefinition),
  createAvatarOption("strobi", strobiDefinition),
  createAvatarOption("freddy", freddyDefinition),
  createAvatarOption("citrus", citrusDefinition),
  createAvatarOption("nova", novaDefinition),
  createAvatarOption("sunee", suneeDefinition),
  createAvatarOption("kirby", kirbyDefinition),
  createAvatarOption("cloudee", cloudeeDefinition),
  createAvatarOption("cubee", cubeeDefinition),
  createAvatarOption("onee", oneeDefinition),
] as const

export type AvatarOption = (typeof AVATAR_OPTIONS)[number]
export type AvatarColors = AvatarDefinitionJson["colors"]
export type AvatarColorOverrides = Partial<Record<AvatarId, AvatarColors>>

export function getAvatarOption(id: AvatarId): AvatarOption {
  return (
    AVATAR_OPTIONS.find((avatar) => avatar.id === id) ??
    AVATAR_OPTIONS.find((avatar) => avatar.id === DEFAULT_AVATAR_ID)!
  )
}

export function getAvatarColors(
  id: AvatarId,
  overrides: AvatarColorOverrides = {}
): AvatarColors {
  const defaults = getAvatarOption(id).definition.colors
  const override = overrides[id]

  return override ? { ...defaults, ...override } : defaults
}

export function createTintedAvatar(
  source: AvatarDefinitionJson,
  body: string,
  eyes: string
) {
  return createAvatar(createTintedDefinition(source, body, eyes))
}

export function createCustomizedDefinition(
  source: AvatarDefinitionJson,
  body: string,
  eyes: string
) {
  const definition = structuredClone(source)
  const defaultBody = source.colors.body.toLowerCase()
  const defaultEyes = source.colors.eyes.toLowerCase()

  definition.colors = { body, eyes }

  for (const expression of Object.values(definition.expressions)) {
    if (!expression.colors) continue

    expression.colors = {
      body:
        expression.colors.body?.toLowerCase() === defaultBody
          ? body
          : expression.colors.body,
      eyes:
        expression.colors.eyes?.toLowerCase() === defaultEyes
          ? eyes
          : expression.colors.eyes,
    }
  }

  return definition
}

export function createTintedDefinition(
  source: AvatarDefinitionJson,
  body: string,
  eyes: string
) {
  const definition = structuredClone(source)

  definition.colors = { body, eyes }

  for (const expression of Object.values(definition.expressions)) {
    expression.colors = { body, eyes }
  }

  return definition
}
