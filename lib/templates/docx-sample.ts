import "server-only"

import { DocxEditor } from "@docx-editor.dev/editor-api"
import PizZip from "pizzip"

import {
  historiaClinicaDraftSchema,
  historiaClinicaFieldMetadata,
  historiaClinicaLeafKeys,
} from "@/lib/historia-clinica-schema"
import { renderHistoriaClinicaDocxTemplateBuffer } from "@/lib/historia-clinica-docx"
import { replaceTextInWordXml } from "@/lib/docx-text-replace"
import { analyzeClinicalTemplateParagraphs } from "@/lib/templates/analyzer"
import {
  createCustomTemplateRenderData,
  createTemplateFieldSlot,
  normalizeTemplateSemanticKey,
} from "@/lib/templates/manifest"
import type {
  TemplateFieldMapping,
  TemplateStructure,
} from "@/lib/templates/types"
import type { TemplateExtractionMode } from "@/lib/templates/validation"

const REQUIRED_DOCX_ENTRIES = ["[Content_Types].xml", "word/document.xml"]
const FORBIDDEN_ENTRY_PATTERNS = [
  /^word\/vbaProject\.bin$/i,
  /^word\/embeddings\//i,
  /^word\/activeX\//i,
  /^word\/afchunk/i,
  /^EncryptedPackage$/i,
]
const MAX_ARCHIVE_ENTRIES = 2_000
const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024

type ZipEntryWithSize = {
  _data?: { uncompressedSize?: number }
  dir?: boolean
}

export async function createSanitizedClinicalTemplate({
  documentBytes,
  extractionMode,
}: {
  documentBytes: Uint8Array
  extractionMode: TemplateExtractionMode
}) {
  validateDocxArchive(documentBytes)

  const runtime = await DocxEditor.createServer(documentBytes, {
    author: "DocBot",
  })

  try {
    const paragraphRecords: Array<{ style: string; text: string }> = []
    const contentControlMappings: Array<{
      confidence: number
      description: string
      fieldPath: string
      label: string
      sampleText: string
      sectionLabel: string
      source: "content_control"
      sourcePaths: string[]
    }> = []
    let contentControlCount = 0

    await runtime.run(async (context) => {
      const paragraphs = context.document.paragraphs
      paragraphs.load("items")
      const contentControls = context.document.contentControls
      contentControls.load("items")
      await context.sync()

      for (const paragraph of paragraphs.items) {
        paragraph.load(["style", "text"])
      }
      for (const control of contentControls.items) {
        control.load(["isBound", "tag", "text", "title"])
      }
      await context.sync()

      contentControlCount = contentControls.items.length
      for (const paragraph of paragraphs.items) {
        const text = paragraph.text.trim()
        if (text) {
          paragraphRecords.push({
            style: paragraph.style || "Normal",
            text,
          })
        }
      }

      const allowedPaths = new Set(historiaClinicaLeafKeys)
      const metadataByPath = new Map(
        historiaClinicaFieldMetadata.map((metadata) => [
          metadata.path,
          metadata,
        ])
      )
      for (const [index, control] of contentControls.items.entries()) {
        const rawTag = control.tag.trim()
        const fieldPath =
          normalizeTemplateSemanticKey(rawTag) ||
          `documento.control_${String(index + 1).padStart(3, "0")}`
        const sampleText = control.text.trim()
        const metadata = metadataByPath.get(fieldPath)
        if (
          control.isBound ||
          !sampleText ||
          sampleText === `{${rawTag}}` ||
          sampleText === `{${fieldPath}}`
        ) {
          continue
        }

        contentControlMappings.push({
          confidence: 1,
          description:
            metadata?.description ??
            `Contenido solicitado por el campo ${control.title.trim() || humanizeFieldPath(fieldPath)}.`,
          fieldPath,
          label: control.title.trim() || humanizeFieldPath(fieldPath),
          sampleText,
          sectionLabel:
            metadata?.sectionLabel ??
            humanizeFieldPath(fieldPath.split(".")[0]),
          source: "content_control",
          sourcePaths: allowedPaths.has(fieldPath) ? [fieldPath] : [],
        })
      }
    })

    const analyzed = await analyzeClinicalTemplateParagraphs({
      extractionMode,
      paragraphs: paragraphRecords,
    })
    const candidates = deduplicateMappings([
      ...contentControlMappings,
      ...analyzed.mappings.map((mapping) => ({
        ...mapping,
        source: "inferred" as const,
      })),
    ])
    const slots = candidates.map((candidate, index) => ({
      ...candidate,
      ...createTemplateFieldSlot({
        confidence: candidate.confidence,
        description: candidate.description,
        fieldPath: candidate.fieldPath,
        index,
        label: candidate.label,
        sectionLabel: candidate.sectionLabel,
        source: candidate.source,
        sourcePaths: candidate.sourcePaths,
      }),
    }))
    await runtime.run(async (context) => {
      const contentControls = context.document.contentControls
      contentControls.load("items")
      await context.sync()
      for (const control of contentControls.items) {
        control.load(["isBound", "tag", "text"])
      }
      await context.sync()

      for (const [index, control] of contentControls.items.entries()) {
        if (control.isBound) continue
        const controlFieldPath =
          normalizeTemplateSemanticKey(control.tag.trim()) ||
          `documento.control_${String(index + 1).padStart(3, "0")}`
        const slot = slots.find(
          (candidate) =>
            candidate.source === "content_control" &&
            candidate.fieldPath === controlFieldPath &&
            candidate.sampleText === control.text.trim()
        )
        if (slot) control.insertText(`{${slot.placeholder}}`, "Replace")
      }
      await context.sync()
    })

    const editorOutput = Buffer.from(await runtime.save())
    const sanitized = scrubDocxPackage({
      documentBytes: editorOutput,
      mappings: slots,
    })
    const discoveredPlaceholders = findPlaceholders(
      sanitized,
      new Set(slots.map((mapping) => mapping.placeholder))
    )
    const publicMappings = slots.flatMap<TemplateFieldMapping>((mapping) =>
      discoveredPlaceholders.has(mapping.placeholder)
        ? [
            {
              confidence: mapping.confidence,
              description: mapping.description,
              fieldPath: mapping.fieldPath,
              label: mapping.label,
              placeholder: mapping.placeholder,
              sectionLabel: mapping.sectionLabel,
              slotId: mapping.slotId,
              source: mapping.source,
              sourcePaths: mapping.sourcePaths,
            },
          ]
        : []
    )
    const placeholderCount = discoveredPlaceholders.size
    const structure: TemplateStructure = {
      analysisChunkCount: analyzed.analysisChunkCount,
      contentControlCount,
      paragraphCount: paragraphRecords.length,
      placeholderCount,
      styleNames: Array.from(
        new Set(paragraphRecords.map((paragraph) => paragraph.style))
      )
        .filter(Boolean)
        .slice(0, 24),
    }

    if (placeholderCount === 0) {
      throw new Error(
        "No reusable clinical fields could be identified in this DOCX."
      )
    }

    // Compile and render once before making the artifact eligible for activation.
    const emptyDraft = historiaClinicaDraftSchema.parse(
      createEmptyClinicalDraft()
    )
    await renderHistoriaClinicaDocxTemplateBuffer({
      draft: emptyDraft,
      templateBuffer: sanitized,
      templateData: createCustomTemplateRenderData({
        draft: emptyDraft,
        mappings: publicMappings,
      }),
      templateKey: "custom-template-validation",
    })

    return {
      buffer: sanitized,
      mappings: publicMappings,
      notes: [
        ...analyzed.notes,
        ...slots
          .filter((mapping) => !discoveredPlaceholders.has(mapping.placeholder))
          .map(
            (mapping) =>
              `No se encontró una coincidencia editable para ${mapping.fieldPath}.`
          ),
      ].slice(0, 12),
      structure,
    }
  } finally {
    runtime.dispose()
  }
}

function validateDocxArchive(documentBytes: Uint8Array) {
  if (
    documentBytes.byteLength < 4 ||
    documentBytes[0] !== 0x50 ||
    documentBytes[1] !== 0x4b
  ) {
    throw new Error("The uploaded file is not a valid DOCX package.")
  }

  let zip: PizZip
  try {
    zip = new PizZip(documentBytes)
  } catch {
    throw new Error("The uploaded DOCX package could not be opened.")
  }

  const entries = Object.entries(zip.files)
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error("The DOCX contains too many package entries.")
  }
  for (const required of REQUIRED_DOCX_ENTRIES) {
    if (!zip.file(required)) {
      throw new Error(`The DOCX is missing ${required}.`)
    }
  }
  for (const [name] of entries) {
    if (FORBIDDEN_ENTRY_PATTERNS.some((pattern) => pattern.test(name))) {
      throw new Error(
        "DOCX files with macros, embedded objects, or active content are not supported."
      )
    }
  }

  const uncompressedBytes = entries.reduce((total, [, entry]) => {
    if ((entry as ZipEntryWithSize).dir) return total
    return total + ((entry as ZipEntryWithSize)._data?.uncompressedSize ?? 0)
  }, 0)
  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new Error("The expanded DOCX package is too large.")
  }

  const relationshipFiles = entries
    .map(([name]) => name)
    .filter((name) => name.endsWith(".rels"))
  for (const name of relationshipFiles) {
    const xml = zip.file(name)?.asText() ?? ""
    if (/TargetMode\s*=\s*["']External["']/i.test(xml)) {
      throw new Error(
        "DOCX files with external links are not supported. Remove the links and try again."
      )
    }
  }

  for (const name of entries.map(([entryName]) => entryName)) {
    if (!name.startsWith("word/") || !name.endsWith(".xml")) continue
    const xml = zip.file(name)?.asText() ?? ""
    if (/<w:(?:ins|del|moveFrom|moveTo)\b/i.test(xml)) {
      throw new Error(
        "This DOCX contains unresolved tracked changes. Accept or reject them in Word, then upload it again."
      )
    }
  }
}

function scrubDocxPackage({
  documentBytes,
  mappings,
}: {
  documentBytes: Uint8Array
  mappings: Array<{
    placeholder: string
    sampleText: string
  }>
}) {
  const zip = new PizZip(documentBytes)

  for (const name of Object.keys(zip.files)) {
    if (
      name === "docProps/custom.xml" ||
      name.startsWith("customXml/") ||
      /^word\/comments[^/]*\.xml$/i.test(name) ||
      /^word\/people\.xml$/i.test(name)
    ) {
      zip.remove(name)
      continue
    }

    if (name.endsWith(".rels")) {
      const entry = zip.file(name)
      if (!entry) continue
      const xml = entry
        .asText()
        .replace(
          /<Relationship\b(?=[^>]*\bTarget=["'][^"']*(?:customXml|comments|people\.xml)[^"']*["'])[^>]*\/>/gi,
          ""
        )
      zip.file(name, xml)
      continue
    }

    if (!name.startsWith("word/") || !name.endsWith(".xml")) continue
    const entry = zip.file(name)
    if (!entry) continue

    let xml = entry.asText()
    xml = xml
      .replace(/<w:commentRangeStart\b[^>]*\/>/gi, "")
      .replace(/<w:commentRangeEnd\b[^>]*\/>/gi, "")
      .replace(/<w:commentReference\b[^>]*\/>/gi, "")

    for (const mapping of [...mappings].sort(
      (left, right) => right.sampleText.length - left.sampleText.length
    )) {
      xml = replaceTextInWordXml({
        replacement: `{${mapping.placeholder}}`,
        search: mapping.sampleText,
        xml,
      }).xml
    }

    zip.file(name, xml)
  }

  const contentTypes = zip.file("[Content_Types].xml")?.asText()
  if (contentTypes) {
    zip.file(
      "[Content_Types].xml",
      contentTypes.replace(
        /<Override\b(?=[^>]*\bPartName=["'][^"']*(?:customXml|comments|people\.xml)[^"']*["'])[^>]*\/>/gi,
        ""
      )
    )
  }

  zip.file(
    "docProps/core.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>DocBot</dc:creator><cp:lastModifiedBy>DocBot</cp:lastModifiedBy><dc:title>DocBot clinical template</dc:title></cp:coreProperties>'
  )

  return zip.generate({
    compression: "DEFLATE",
    type: "nodebuffer",
  }) as Buffer
}

function findPlaceholders(documentBytes: Uint8Array, expected: Set<string>) {
  const zip = new PizZip(documentBytes)
  const placeholders = new Set<string>()

  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("word/") || !name.endsWith(".xml")) continue
    const xml = zip.file(name)?.asText() ?? ""
    for (const match of xml.matchAll(/\{([^{}]+)\}/g)) {
      if (expected.has(match[1].trim())) {
        placeholders.add(match[1].trim())
      }
    }
  }

  return placeholders
}

function deduplicateMappings<
  T extends { confidence: number; fieldPath: string; sampleText: string },
>(mappings: T[]) {
  const unique = new Map<string, T>()
  for (const mapping of mappings) {
    const sampleText = mapping.sampleText.trim()
    if (!sampleText || sampleText === `{${mapping.fieldPath}}`) continue
    const existing = unique.get(sampleText)
    if (!existing || mapping.confidence > existing.confidence) {
      unique.set(sampleText, { ...mapping, sampleText })
    }
  }
  return [...unique.values()]
}

function humanizeFieldPath(fieldPath: string) {
  return fieldPath
    .split(".")
    .at(-1)!
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toLocaleUpperCase("es"))
}

function createEmptyClinicalDraft(): Record<string, unknown> {
  const draft: Record<string, unknown> = {}

  for (const fieldPath of historiaClinicaLeafKeys) {
    const parts = fieldPath.split(".")
    let current = draft

    for (const part of parts.slice(0, -1)) {
      const child = current[part]
      if (!child || typeof child !== "object" || Array.isArray(child)) {
        current[part] = {}
      }
      current = current[part] as Record<string, unknown>
    }

    current[parts.at(-1)!] = null
  }

  const diagnostic = draft.impresion_diagnostica as Record<string, unknown>
  diagnostic.problemas_activos_secundarios = []
  return draft
}
