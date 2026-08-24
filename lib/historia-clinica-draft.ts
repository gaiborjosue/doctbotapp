import "server-only"

import {
  historiaClinicaDraftSchema,
  historiaClinicaJsonSchema,
  historiaClinicaLeafKeys,
  type HistoriaClinicaDraft,
} from "@/lib/historia-clinica-schema"
import { parseGeminiJsonObject } from "@/lib/gemini-json"
import { z } from "zod"

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
  "Redacta como historia clínica de Medicina Interna: narrativa temporal clara, lenguaje médico profesional, problemas clínicos bien representados y solo datos respaldados. Omite rutas sin soporte; no inventes ni escribas dudas, ausencias de información o meta-comentarios."

const IMPRESION_DIAGNOSTICA_FIELD_GUIDE =
  "Impresión diagnóstica: problema_principal es el problema clínico central actual y debe llenarse si existe motivo de consulta o enfermedad actual; redacta un título clínico breve, no una frase genérica. problemas_activos_secundarios son condiciones, hallazgos o factores actuales relevantes que acompañan al problema principal e influyen en diagnóstico, pronóstico o manejo. Para cada item, titulo es el nombre breve; pertinentes_positivos son datos que lo sustentan; pertinentes_negativos son ausencias explícitas que delimitan complicaciones o diferenciales. No uses esta lista para diferenciales especulativos."

export const HISTORIA_CLINICA_EXTRACTION_PROMPT = [
  "Convierte la evidencia del audio en campos de una historia clínica estructurada en español.",
  HISTORIA_CLINICA_STYLE_GUIDE,
  IMPRESION_DIAGNOSTICA_FIELD_GUIDE,
  "Criterios: motivo breve; enfermedad actual narrativa; antecedentes y examen físico conservadores; impresión diagnóstica orientada por problemas. Las negaciones solo pueden incluirse cuando sean explícitas.",
  "Incluye únicamente hechos respaldados. Omite los campos sin información y no incluyas plan_manejo.d1 ni plan_manejo.m1.",
  "Si existe un síntoma o motivo de consulta, completa motivo_consulta.texto, redacta enfermedad_actual.texto y define impresion_diagnostica.problema_principal.",
  "Cada path debe coincidir exactamente con una de las rutas permitidas.",
].join(" ")

export const historiaClinicaExtractionResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    campos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          value: { type: "string" },
        },
        required: ["path", "value"],
      },
    },
    problemas_activos_secundarios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          titulo: { type: "string" },
          pertinentes_positivos: { type: "string" },
          pertinentes_negativos: { type: "string" },
        },
        required: ["titulo", "pertinentes_positivos", "pertinentes_negativos"],
      },
    },
  },
  required: ["campos", "problemas_activos_secundarios"],
} as const

const historiaClinicaExtractionSchema = z.object({
  campos: z
    .array(
      z.object({
        path: z.string().trim().min(1).max(240),
        value: z.string().trim().min(1).max(12_000),
      })
    )
    .max(historiaClinicaLeafKeys.length),
  problemas_activos_secundarios: z
    .array(
      z.object({
        titulo: z.string().trim().min(1).max(500),
        pertinentes_positivos: z.string().trim().max(4_000),
        pertinentes_negativos: z.string().trim().max(4_000),
      })
    )
    .max(40),
})

const historiaClinicaLeafKeySet = new Set(historiaClinicaLeafKeys)

export function parseHistoriaClinicaDraft(outputText: string) {
  const parsed = parseGeminiJsonObject(outputText)
  assertHistoriaClinicaShape(parsed)

  return normalizeHistoriaClinicaDraft(parsed)
}

export function createHistoriaClinicaDraftFromExtraction(outputText: string) {
  const extraction = historiaClinicaExtractionSchema.parse(
    parseGeminiJsonObject(outputText)
  )
  const source: Record<string, unknown> = {}

  for (const field of extraction.campos) {
    if (!historiaClinicaLeafKeySet.has(field.path)) continue
    if (field.path === "plan_manejo.d1" || field.path === "plan_manejo.m1") {
      continue
    }

    assignHistoriaClinicaPath(source, field.path, field.value)
  }

  assignHistoriaClinicaPath(
    source,
    "impresion_diagnostica.problemas_activos_secundarios",
    extraction.problemas_activos_secundarios
  )

  return normalizeHistoriaClinicaDraft(source)
}

function normalizeHistoriaClinicaDraft(value: unknown) {
  const completed = completeJsonSchemaValue(
    value,
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

function assignHistoriaClinicaPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown
) {
  const parts = path.split(".")
  let current = target

  for (const part of parts.slice(0, -1)) {
    const existing = current[part]
    if (isRecord(existing)) {
      current = existing
      continue
    }

    const child: Record<string, unknown> = {}
    current[part] = child
    current = child
  }

  current[parts.at(-1)!] = value
}

function assertHistoriaClinicaShape(value: unknown) {
  const expectedTopLevelKeys = [
    "antecedentes",
    "datos_personales",
    "enfermedad_actual",
    "examen_fisico",
    "fecha_atencion",
    "impresion_diagnostica",
    "motivo_consulta",
    "plan_manejo",
    "ras",
  ]

  if (
    !isRecord(value) ||
    !expectedTopLevelKeys.some((key) => Object.hasOwn(value, key))
  ) {
    throw new Error(
      "Gemini returned clinical JSON that does not match the report schema."
    )
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
