import rawHistoriaClinicaSchema from "@/schemas/historia-clinica-medicina-interna.schema.json"
import { z } from "zod"

type JsonSchemaNode = {
  $ref?: string
  additionalProperties?: boolean
  description?: string
  items?: JsonSchemaNode
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
  title?: string
  type?: string | string[]
}

type JsonSchemaRoot = JsonSchemaNode & {
  $defs?: Record<string, JsonSchemaNode>
}

type HistoriaClinicaLeafValue = string | null
export type HistoriaClinicaProblemItem = {
  titulo: HistoriaClinicaLeafValue
  pertinentes_positivos: HistoriaClinicaLeafValue
  pertinentes_negativos: HistoriaClinicaLeafValue
}

export interface HistoriaClinicaSectionNode {
  [key: string]:
    | HistoriaClinicaLeafValue
    | HistoriaClinicaProblemItem[]
    | HistoriaClinicaSectionNode
}

export type HistoriaClinicaDraft = {
  fecha_atencion: HistoriaClinicaLeafValue
  datos_personales: Record<string, HistoriaClinicaLeafValue>
  motivo_consulta: { texto: HistoriaClinicaLeafValue }
  enfermedad_actual: { texto: HistoriaClinicaLeafValue }
  antecedentes: HistoriaClinicaSectionNode
  ras: HistoriaClinicaSectionNode
  examen_fisico: HistoriaClinicaSectionNode
  impresion_diagnostica: {
    problema_principal: HistoriaClinicaLeafValue
    problemas_activos_secundarios: HistoriaClinicaProblemItem[]
  }
  plan_manejo: Record<string, HistoriaClinicaLeafValue>
}

const historiaClinicaSchemaSource = enrichHistoriaClinicaSchema(
  structuredClone(rawHistoriaClinicaSchema) as JsonSchemaRoot
)

export const historiaClinicaJsonSchema = historiaClinicaSchemaSource
export const historiaClinicaDraftSchema = buildZodSchema(
  historiaClinicaJsonSchema,
  historiaClinicaJsonSchema
) as z.ZodType<HistoriaClinicaDraft>

export const historiaClinicaLeafKeys = collectLeafKeys(
  historiaClinicaJsonSchema
)
export const historiaClinicaFieldMetadata = collectFieldMetadata(
  historiaClinicaJsonSchema
)

function enrichHistoriaClinicaSchema(schema: JsonSchemaRoot) {
  setDescription(
    schema,
    ["datos_personales"],
    "Datos de identificación del paciente."
  )
  setDescription(
    schema,
    ["motivo_consulta", "texto"],
    "Resumen breve del motivo de consulta o razón principal del contacto."
  )
  setDescription(
    schema,
    ["enfermedad_actual", "texto"],
    "Narrativa clínica breve de la enfermedad o problema actual."
  )
  setDescription(
    schema,
    ["antecedentes"],
    "Antecedentes personales y familiares relevantes."
  )
  setDescription(
    schema,
    ["ras"],
    "Revisión por aparatos y sistemas. Si no hay soporte en el transcript, usar null."
  )
  setDescription(
    schema,
    ["examen_fisico"],
    "Examen físico y signos vitales. No inventar hallazgos ni valores."
  )
  setDescription(
    schema,
    ["plan_manejo"],
    "Plan de manejo integral. No llenar diagnósticos ni medicación."
  )
  setDescription(
    schema,
    ["impresion_diagnostica"],
    "Impresión diagnóstica orientada por problemas clínicos actuales."
  )
  setDescription(
    schema,
    ["impresion_diagnostica", "problema_principal"],
    "Problema clínico central que motiva la consulta o ingreso actual."
  )
  setDescription(
    schema,
    ["impresion_diagnostica", "problemas_activos_secundarios"],
    "Problemas clínicos actuales relevantes que acompañan al problema principal e influyen en diagnóstico, pronóstico o manejo."
  )
  setArrayItemDescription(
    schema,
    ["impresion_diagnostica", "problemas_activos_secundarios"],
    ["titulo"],
    "Nombre breve del problema activo o secundario."
  )
  setArrayItemDescription(
    schema,
    ["impresion_diagnostica", "problemas_activos_secundarios"],
    ["pertinentes_positivos"],
    "Evidencia clínica que sustenta el problema: síntomas, antecedentes, examen físico, riesgos, tratamientos, laboratorios o imágenes."
  )
  setArrayItemDescription(
    schema,
    ["impresion_diagnostica", "problemas_activos_secundarios"],
    ["pertinentes_negativos"],
    "Datos ausentes explícitos que delimitan el problema o reducen sospecha de complicaciones/diferenciales."
  )

  setDescription(
    schema,
    ["plan_manejo", "a1"],
    "Resumen clínico o motivo de ingreso."
  )
  setDescription(
    schema,
    ["plan_manejo", "d1"],
    "Diagnósticos. No llenar este campo; debe devolverse null."
  )
  setDescription(
    schema,
    ["plan_manejo", "c1"],
    "Condición clínica actual del paciente."
  )
  setDescription(schema, ["plan_manejo", "a2"], "Alergias relevantes.")
  setDescription(
    schema,
    ["plan_manejo", "v1"],
    "Vigilancia o signos vitales relevantes. No inventar valores."
  )
  setDescription(
    schema,
    ["plan_manejo", "a3"],
    "Actividad o estado funcional actual."
  )
  setDescription(
    schema,
    ["plan_manejo", "n1"],
    "Necesidades de enfermería o monitoreo clínico."
  )
  setDescription(schema, ["plan_manejo", "d2"], "Dieta indicada o referida.")
  setDescription(
    schema,
    ["plan_manejo", "i1"],
    "Indicaciones generales o hidratación."
  )
  setDescription(
    schema,
    ["plan_manejo", "m1"],
    "Medicación. No llenar este campo; debe devolverse null."
  )
  setDescription(
    schema,
    ["plan_manejo", "e1"],
    "Exámenes o imágenes solicitados o relevantes."
  )
  setDescription(
    schema,
    ["plan_manejo", "l1"],
    "Laboratorios solicitados o relevantes."
  )
  setDescription(
    schema,
    ["plan_manejo", "c2"],
    "Consultas o interconsultas requeridas."
  )

  return schema
}

function setDescription(
  schema: JsonSchemaRoot,
  path: string[],
  description: string
) {
  let current: JsonSchemaNode | undefined = schema

  for (const part of path) {
    current = current?.properties?.[part]
  }

  if (current) {
    current.description = description
  }
}

function setArrayItemDescription(
  schema: JsonSchemaRoot,
  arrayPath: string[],
  itemPath: string[],
  description: string
) {
  let current: JsonSchemaNode | undefined = schema

  for (const part of arrayPath) {
    current = current?.properties?.[part]
  }

  current = current?.items

  for (const part of itemPath) {
    current = current?.properties?.[part]
  }

  if (current) {
    current.description = description
  }
}

function buildZodSchema(
  node: JsonSchemaNode,
  root: JsonSchemaRoot
): z.ZodTypeAny {
  if (node.$ref) {
    return buildZodSchema(resolveRef(node.$ref, root), root)
  }

  if (isNullableString(node.type)) {
    return withDescription(z.string().nullable(), node)
  }

  if (node.type === "object") {
    const properties = node.properties ?? {}
    const required = new Set(node.required ?? [])
    const optionalKeys = Object.keys(properties).filter(
      (key) => !required.has(key)
    )

    if (optionalKeys.length > 0) {
      throw new Error(
        `OpenAI structured outputs requieren propiedades obligatorias. Faltan en 'required': ${optionalKeys.join(", ")}`
      )
    }

    const shape = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        buildZodSchema(value, root),
      ])
    )

    const objectSchema = z.object(shape)
    return withDescription(
      node.additionalProperties === false
        ? objectSchema.strict()
        : objectSchema,
      node
    )
  }

  if (node.type === "array") {
    const itemSchema = node.items

    if (!itemSchema) {
      throw new Error(
        "Array sin definición de items en schema de historia clínica."
      )
    }

    return withDescription(z.array(buildZodSchema(itemSchema, root)), node)
  }

  throw new Error(
    `Tipo de JSON schema no soportado para la historia clínica: ${JSON.stringify(node.type)}`
  )
}

function withDescription<T extends z.ZodTypeAny>(
  schema: T,
  node: JsonSchemaNode
) {
  const description = node.description ?? node.title
  return description ? schema.describe(description) : schema
}

function resolveRef(ref: string, root: JsonSchemaRoot) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Solo se soportan referencias locales: ${ref}`)
  }

  const parts = ref.replace(/^#\//, "").split("/")
  let current: unknown = root

  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      throw new Error(`No se pudo resolver la referencia del schema: ${ref}`)
    }

    current = (current as Record<string, unknown>)[part]
  }

  return current as JsonSchemaNode
}

function isNullableString(type: JsonSchemaNode["type"]) {
  return Array.isArray(type) && type.includes("string") && type.includes("null")
}

function collectLeafKeys(node: JsonSchemaNode, prefix = ""): string[] {
  if (node.$ref || isNullableString(node.type)) {
    return prefix ? [prefix] : []
  }

  if (node.type !== "object" || !node.properties) {
    return []
  }

  return Object.entries(node.properties).flatMap(([key, value]) =>
    collectLeafKeys(value, prefix ? `${prefix}.${key}` : key)
  )
}

function collectFieldMetadata(
  node: JsonSchemaNode,
  prefix = ""
): Array<{
  description: string
  label: string
  path: string
  sectionLabel: string
}> {
  if (node.$ref || isNullableString(node.type)) {
    if (!prefix) return []

    const label = humanizeSchemaKey(prefix.split(".").at(-1)!)
    const sectionLabel = humanizeSchemaKey(prefix.split(".")[0])
    return [
      {
        description: node.description ?? `${label} dentro de ${sectionLabel}.`,
        label,
        path: prefix,
        sectionLabel,
      },
    ]
  }

  if (node.type !== "object" || !node.properties) return []

  return Object.entries(node.properties).flatMap(([key, value]) =>
    collectFieldMetadata(value, prefix ? `${prefix}.${key}` : key)
  )
}

function humanizeSchemaKey(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toLocaleUpperCase("es"))
}
