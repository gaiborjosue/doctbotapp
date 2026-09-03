import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import Docxtemplater from "docxtemplater"
import PizZip from "pizzip"

import type { HistoriaClinicaDraft } from "@/lib/historia-clinica-schema"

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "schemas",
  "Historia_clinica_medicina_interna_template_editable.docx"
)
const DOCUMENT_XML_PATH = "word/document.xml"

export const HISTORIA_CLINICA_TEMPLATE_KEY =
  "historia-clinica-medicina-interna-v1"
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export async function renderHistoriaClinicaDocxBuffer(
  draft: HistoriaClinicaDraft
) {
  const templateBuffer = await readFile(TEMPLATE_PATH)
  return renderHistoriaClinicaDocxTemplateBuffer({
    draft,
    templateBuffer,
    templateKey: HISTORIA_CLINICA_TEMPLATE_KEY,
  })
}

export async function renderHistoriaClinicaDocxTemplateBuffer({
  draft,
  templateBuffer,
  templateData,
  templateKey,
}: {
  draft: HistoriaClinicaDraft
  templateBuffer: Uint8Array
  templateData?: Record<string, unknown>
  templateKey: string
}) {
  const zip = new PizZip(templateBuffer)
  const documentXml = zip.file(DOCUMENT_XML_PATH)?.asText()

  if (!documentXml) {
    throw new Error(`The DOCX template is missing ${DOCUMENT_XML_PATH}.`)
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    parser: nestedPathParser,
    nullGetter: () => "",
  })

  doc.render(normalizeTemplateData(templateData ?? draft))

  return {
    buffer: doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    }) as Buffer,
    placeholderCount: extractDocxtemplaterTags(documentXml).length,
    templateKey,
  }
}

function extractDocxtemplaterTags(xml: string) {
  return Array.from(
    new Set(
      Array.from(xml.matchAll(/\{[#/]?([^}]+)\}/g), (match) => match[1].trim())
    )
  )
    .filter(Boolean)
    .sort()
}

function normalizeTemplateData(value: unknown): unknown {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value)) return value.map(normalizeTemplateData)

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeTemplateData(entry),
      ])
    )
  }

  return value
}

function nestedPathParser(tag: string) {
  return {
    get(scope: unknown) {
      return resolveNestedPath(scope, tag)
    },
  }
}

function resolveNestedPath(scope: unknown, tag: string): unknown {
  if (tag === ".") return scope

  return tag.split(".").reduce<unknown>((current, part) => {
    if (current === null || current === undefined) return undefined
    if (typeof current !== "object") return undefined

    return (current as Record<string, unknown>)[part]
  }, scope)
}
