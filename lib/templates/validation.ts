import { z } from "zod"

export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024
export const MAX_SESSION_TAGS = 5
export const MAX_TEMPLATE_RULE_TAGS = 8
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export const templateExtractionModeSchema = z.enum([
  "structure_only",
  "structure_and_wording",
])

export type TemplateExtractionMode = z.infer<
  typeof templateExtractionModeSchema
>

export const tagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => !/[\r\n\t]/.test(value), "Tags must be one line.")

export const sessionTagsSchema = z
  .array(tagNameSchema)
  .max(MAX_SESSION_TAGS)
  .transform((values) => uniqueTags(values))

export const templateRuleTagsSchema = z
  .array(tagNameSchema)
  .max(MAX_TEMPLATE_RULE_TAGS)
  .transform((values) => uniqueTags(values))

export const prepareTemplateUploadSchema = z.object({
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  description: z.string().trim().max(500).optional().default(""),
  extractionMode: templateExtractionModeSchema.default("structure_and_wording"),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(80),
  size: z.number().int().min(1).max(MAX_TEMPLATE_BYTES),
})

export const activateTemplateSchema = z
  .object({
    isDefault: z.boolean().optional().default(false),
    tags: templateRuleTagsSchema.optional().default([]),
  })
  .refine((value) => value.isDefault || value.tags.length > 0, {
    message: "Choose at least one tag or make this the default template.",
  })

export function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es")
}

export function parseTagInput(value: string, limit = MAX_TEMPLATE_RULE_TAGS) {
  return uniqueTags(value.split(",")).slice(0, limit)
}

export function validateTemplateFileDescriptor({
  fileName,
  mimeType,
  size,
}: {
  fileName: string
  mimeType: string
  size: number
}) {
  if (!fileName.toLocaleLowerCase("en").endsWith(".docx")) {
    return "Choose a .docx file."
  }

  if (
    mimeType &&
    mimeType !== DOCX_MIME_TYPE &&
    mimeType !== "application/octet-stream"
  ) {
    return "This file is not a supported Word document."
  }

  if (size < 1 || size > MAX_TEMPLATE_BYTES) {
    return "Template examples must be 10 MB or smaller."
  }
}

function uniqueTags(values: string[]) {
  const tags = new Map<string, string>()

  for (const value of values) {
    const name = value.trim().replace(/\s+/g, " ")
    if (!name) continue

    const normalized = normalizeTagName(name)
    if (!tags.has(normalized)) tags.set(normalized, name)
  }

  return [...tags.values()]
}
