import "server-only"

import {
  historiaClinicaFieldMetadata,
  historiaClinicaLeafKeys,
  type HistoriaClinicaDraft,
} from "@/lib/historia-clinica-schema"
import type { TemplateFieldMapping } from "@/lib/templates/types"

const allowedFieldPaths = new Set(historiaClinicaLeafKeys)
const fieldMetadataByPath = new Map(
  historiaClinicaFieldMetadata.map((field) => [field.path, field])
)
const PLACEHOLDER_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{0,159}$/
const SEMANTIC_KEY_PATTERN = /^[a-z0-9_]+(?:\.[a-z0-9_]+){0,5}$/

export function createTemplateFieldSlot({
  confidence,
  description,
  fieldPath,
  index,
  label,
  sectionLabel,
  source,
  sourcePaths,
}: {
  confidence: number
  description?: string
  fieldPath: string
  index: number
  label?: string
  sectionLabel?: string
  source: TemplateFieldMapping["source"]
  sourcePaths?: string[]
}): TemplateFieldMapping {
  const metadata = fieldMetadataByPath.get(fieldPath)
  const slotId = `slot_${String(index + 1).padStart(3, "0")}`
  const directSourcePaths = normalizeSourcePaths(sourcePaths)
  const resolvedSourcePaths =
    directSourcePaths.length > 0
      ? directSourcePaths
      : allowedFieldPaths.has(fieldPath)
        ? [fieldPath]
        : []

  return {
    confidence,
    description:
      cleanMetadata(description, 1_000) ??
      metadata?.description ??
      `Contenido clínico solicitado por el campo ${humanizeFieldPath(fieldPath)}.`,
    fieldPath,
    label:
      cleanMetadata(label, 160) ??
      metadata?.label ??
      humanizeFieldPath(fieldPath),
    placeholder: `docbot_slots.${slotId}`,
    sectionLabel:
      cleanMetadata(sectionLabel, 160) ??
      metadata?.sectionLabel ??
      humanizeFieldPath(fieldPath.split(".")[0]),
    slotId,
    source,
    sourcePaths: resolvedSourcePaths,
  }
}

export function normalizeStoredTemplateMappings(
  value: unknown
): TemplateFieldMapping[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry, index) => {
    if (!isRecord(entry) || typeof entry.fieldPath !== "string") return []
    const fieldPath = normalizeTemplateSemanticKey(entry.fieldPath)
    if (!fieldPath) return []

    const metadata = fieldMetadataByPath.get(fieldPath)
    const slotId =
      typeof entry.slotId === "string" && entry.slotId.trim()
        ? entry.slotId.trim().slice(0, 80)
        : `legacy_${String(index + 1).padStart(3, "0")}`
    const requestedPlaceholder =
      typeof entry.placeholder === "string" ? entry.placeholder.trim() : ""
    const placeholder = PLACEHOLDER_PATTERN.test(requestedPlaceholder)
      ? requestedPlaceholder
      : allowedFieldPaths.has(fieldPath)
        ? fieldPath
        : `docbot_slots.${slotId}`
    const sourcePaths = normalizeSourcePaths(entry.sourcePaths)

    return [
      {
        confidence:
          typeof entry.confidence === "number" &&
          Number.isFinite(entry.confidence)
            ? Math.min(1, Math.max(0, entry.confidence))
            : 0.75,
        description:
          typeof entry.description === "string" && entry.description.trim()
            ? entry.description.trim().slice(0, 1_000)
            : (metadata?.description ?? `Contenido clínico para ${fieldPath}.`),
        fieldPath,
        label:
          typeof entry.label === "string" && entry.label.trim()
            ? entry.label.trim().slice(0, 160)
            : (metadata?.label ?? humanizeFieldPath(fieldPath)),
        placeholder,
        sectionLabel:
          typeof entry.sectionLabel === "string" && entry.sectionLabel.trim()
            ? entry.sectionLabel.trim().slice(0, 160)
            : (metadata?.sectionLabel ??
              humanizeFieldPath(fieldPath.split(".")[0])),
        slotId,
        source:
          entry.source === "content_control" ? "content_control" : "inferred",
        sourcePaths:
          sourcePaths.length > 0
            ? sourcePaths
            : allowedFieldPaths.has(fieldPath)
              ? [fieldPath]
              : [],
      } satisfies TemplateFieldMapping,
    ]
  })
}

export function normalizeTemplateSemanticKey(value: string) {
  const normalized = value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .split(".")
    .map((part) =>
      part
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 48)
    )
    .filter(Boolean)
    .slice(0, 6)
    .join(".")

  return SEMANTIC_KEY_PATTERN.test(normalized) && normalized.length <= 160
    ? normalized
    : ""
}

export function createCustomTemplateRenderData({
  draft,
  mappings,
}: {
  draft: HistoriaClinicaDraft
  mappings: TemplateFieldMapping[]
}) {
  const data = structuredClone(draft) as Record<string, unknown>
  const slots: Record<string, string> = {}

  for (const mapping of mappings) {
    if (!mapping.placeholder.startsWith("docbot_slots.")) continue

    const values = mapping.sourcePaths
      .map((path) => resolveNestedPath(draft, path))
      .map(formatTemplateValue)
      .filter(Boolean)
    slots[mapping.slotId] = [...new Set(values)].join("\n")
  }

  data.docbot_slots = slots
  return data
}

function resolveNestedPath(value: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!isRecord(current)) return undefined
    return current[part]
  }, value)
}

function formatTemplateValue(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(formatTemplateValue).filter(Boolean).join("\n")
  }
  return ""
}

function normalizeSourcePaths(value: unknown) {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .filter((path): path is string => typeof path === "string")
        .map((path) => path.trim())
        .filter((path) => allowedFieldPaths.has(path))
    ),
  ].slice(0, 8)
}

function cleanMetadata(value: unknown, maxLength: number) {
  if (typeof value !== "string") return
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, maxLength)
  return cleaned || undefined
}

function humanizeFieldPath(fieldPath: string) {
  return fieldPath
    .split(".")
    .at(-1)!
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toLocaleUpperCase("es"))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
