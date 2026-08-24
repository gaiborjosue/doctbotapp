import "server-only"

import {
  historiaClinicaDraftSchema,
  historiaClinicaJsonSchema,
  type HistoriaClinicaDraft,
} from "@/lib/historia-clinica-schema"
import { parseGeminiJsonObject } from "@/lib/gemini-json"

type JsonSchemaNode = {
  $defs?: Record<string, JsonSchemaNode>
  $ref?: string
  default?: unknown
  items?: JsonSchemaNode
  properties?: Record<string, JsonSchemaNode>
  type?: string | string[]
  [key: string]: unknown
}

const FORBIDDEN_CHART_PATTERNS = [
  /\bOLD\s*CARTS\b/i,
  /\bOPQRST\b/i,
  /\bALICIAME\b/i,
  /\ben el audio\b/i,
  /\bseg[uú]n el audio\b/i,
  /\bno claramente distinguible\b/i,
  /\bno (?:está|esta)?\s*clar[oa]s?\b/i,
  /\bno se puede (?:determinar|distinguir|confirmar)\b/i,
  /\bno se logra (?:determinar|distinguir|confirmar)\b/i,
  /\btexto del prompt\b/i,
]

const HISTORIA_CLINICA_STYLE_GUIDE =
  "Redacta como historia clínica de Medicina Interna: narrativa temporal clara, lenguaje médico profesional, problemas clínicos bien representados y solo datos respaldados. Usa null cuando falte soporte; no inventes ni escribas dudas o meta-comentarios."

const IMPRESION_DIAGNOSTICA_FIELD_GUIDE =
  "Impresión diagnóstica: problema_principal es el problema clínico central actual y debe llenarse si existe motivo de consulta o enfermedad actual; redacta un título clínico breve, no una frase genérica. problemas_activos_secundarios son condiciones, hallazgos o factores actuales relevantes que acompañan al problema principal e influyen en diagnóstico, pronóstico o manejo. Para cada item, titulo es el nombre breve; pertinentes_positivos son datos que lo sustentan; pertinentes_negativos son ausencias explícitas que delimitan complicaciones o diferenciales. No uses esta lista para diferenciales especulativos."

export const HISTORIA_CLINICA_EXTRACTION_PROMPT = [
  "Escucha el audio completo y extrae una historia clínica estructurada en español.",
  HISTORIA_CLINICA_STYLE_GUIDE,
  IMPRESION_DIAGNOSTICA_FIELD_GUIDE,
  "Criterios: motivo breve; enfermedad actual narrativa; antecedentes y examen físico conservadores; impresión diagnóstica orientada por problemas. Las negaciones solo pueden incluirse cuando sean explícitas.",
  "plan_manejo.d1 y plan_manejo.m1 deben ser null.",
  "Conserva todas las claves del esquema. Usa null o [] cuando no haya información respaldada por el audio.",
  "Devuelve únicamente el objeto JSON solicitado, sin Markdown ni texto adicional.",
].join(" ")

export const historiaClinicaGeminiResponseSchema = stripUnsupportedSchemaFields(
  structuredClone(historiaClinicaJsonSchema) as JsonSchemaNode
)

export function parseHistoriaClinicaDraft(outputText: string) {
  const parsed = parseGeminiJsonObject(outputText)

  const completed = completeJsonSchemaValue(
    parsed,
    historiaClinicaJsonSchema as JsonSchemaNode,
    historiaClinicaJsonSchema as JsonSchemaNode
  )
  const draft = historiaClinicaDraftSchema.parse(completed)

  return historiaClinicaDraftSchema.parse(
    sanitizeHistoriaClinicaDraft({
      ...draft,
      plan_manejo: {
        ...draft.plan_manejo,
        d1: null,
        m1: null,
      },
    })
  )
}

export function summarizeHistoriaClinicaDraft(draft: HistoriaClinicaDraft) {
  const sections = [
    formatSummaryLine("Motivo de consulta", draft.motivo_consulta.texto),
    formatSummaryLine("Enfermedad actual", draft.enfermedad_actual.texto),
    formatSummaryLine(
      "Problema principal",
      draft.impresion_diagnostica.problema_principal
    ),
  ].filter((line): line is string => Boolean(line))

  if (draft.impresion_diagnostica.problemas_activos_secundarios.length > 0) {
    sections.push(
      `Problemas activos: ${draft.impresion_diagnostica.problemas_activos_secundarios
        .map((problem) => problem.titulo)
        .filter((title): title is string => Boolean(title))
        .join(", ")}.`
    )
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "La historia clínica fue estructurada, pero el audio no contenía datos clínicos suficientes para resumir."
}

function formatSummaryLine(label: string, value: string | null) {
  const normalized = sanitizeLeafValue(value)
  return normalized ? `**${label}:** ${normalized}` : null
}

function completeJsonSchemaValue(
  value: unknown,
  node: JsonSchemaNode,
  root: JsonSchemaNode
): unknown {
  const resolvedNode = resolveJsonSchemaRef(node, root)
  const nodeType = resolvedNode.type

  if (Array.isArray(nodeType) && nodeType.includes("string")) {
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value)
    }
    return null
  }

  if (nodeType === "string") {
    return typeof value === "string" ? value : null
  }

  if (nodeType === "array") {
    if (!Array.isArray(value) || !resolvedNode.items) return []
    return value.map((entry) =>
      completeJsonSchemaValue(entry, resolvedNode.items!, root)
    )
  }

  if (nodeType === "object" || resolvedNode.properties) {
    const source = isRecord(value) ? value : {}
    const properties = resolvedNode.properties ?? {}

    return Object.fromEntries(
      Object.entries(properties).map(([key, childNode]) => [
        key,
        completeJsonSchemaValue(source[key], childNode, root),
      ])
    )
  }

  return value ?? null
}

function resolveJsonSchemaRef(node: JsonSchemaNode, root: JsonSchemaNode) {
  if (!node.$ref) return node

  const refPrefix = "#/$defs/"
  if (!node.$ref.startsWith(refPrefix)) return node

  return root.$defs?.[node.$ref.slice(refPrefix.length)] ?? node
}

function sanitizeHistoriaClinicaDraft(
  value: HistoriaClinicaDraft
): HistoriaClinicaDraft {
  return normalizeImpresionDiagnostica(
    sanitizeHistoriaClinicaNode(value) as HistoriaClinicaDraft
  )
}

function sanitizeHistoriaClinicaNode(
  value: string | null | unknown[] | Record<string, unknown>
): string | null | unknown[] | Record<string, unknown> {
  if (value === null || typeof value === "string") {
    return sanitizeLeafValue(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      sanitizeHistoriaClinicaNode(
        entry as string | null | unknown[] | Record<string, unknown>
      )
    )
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sanitizeHistoriaClinicaNode(
        entry as string | null | unknown[] | Record<string, unknown>
      ),
    ])
  )
}

function sanitizeLeafValue(value: string | null) {
  if (value === null) return null

  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/\s([.,;:])/g, "$1")
    .trim()

  if (!normalized) return null

  const cleaned = normalized
    .split(/(?<=[.;:])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter(
      (segment) =>
        !FORBIDDEN_CHART_PATTERNS.some((pattern) => pattern.test(segment))
    )
    .join(" ")
    .trim()

  return cleaned || null
}

function normalizeImpresionDiagnostica(
  value: HistoriaClinicaDraft
): HistoriaClinicaDraft {
  return {
    ...value,
    impresion_diagnostica: {
      ...value.impresion_diagnostica,
      problema_principal:
        value.impresion_diagnostica.problema_principal ??
        inferProblemaPrincipal(value),
      problemas_activos_secundarios:
        value.impresion_diagnostica.problemas_activos_secundarios.map(
          (problem) => ({
            ...problem,
            pertinentes_positivos:
              problem.pertinentes_positivos ??
              "Sin pertinentes positivos registrados.",
            pertinentes_negativos:
              problem.pertinentes_negativos ??
              "Sin pertinentes negativos registrados.",
          })
        ),
    },
  }
}

function inferProblemaPrincipal(value: HistoriaClinicaDraft) {
  return (
    firstUsableText(value.motivo_consulta.texto) ??
    firstUsableText(value.enfermedad_actual.texto) ??
    firstUsableText(
      value.impresion_diagnostica.problemas_activos_secundarios[0]?.titulo ??
        null
    )
  )
}

function firstUsableText(value: string | null) {
  const normalized = sanitizeLeafValue(value)
  return (
    normalized
      ?.split(/(?<=[.;:])\s+/)[0]
      ?.slice(0, 220)
      .trim() || null
  )
}

function stripUnsupportedSchemaFields(node: JsonSchemaNode): JsonSchemaNode {
  const result: JsonSchemaNode = {}

  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema" || key === "$id" || key === "default") continue

    if (Array.isArray(value)) {
      result[key] = value.map((entry) =>
        isRecord(entry)
          ? stripUnsupportedSchemaFields(entry as JsonSchemaNode)
          : entry
      )
      continue
    }

    result[key] = isRecord(value)
      ? Object.fromEntries(
          Object.entries(value).map(([childKey, childValue]) => [
            childKey,
            isRecord(childValue)
              ? stripUnsupportedSchemaFields(childValue as JsonSchemaNode)
              : childValue,
          ])
        )
      : value
  }

  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
