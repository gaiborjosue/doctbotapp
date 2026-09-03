import type {
  DocBotTemplateSummary,
  TemplateFieldMapping,
  TemplateStructure,
} from "@/lib/templates/types"
import {
  DOCX_MIME_TYPE,
  type TemplateExtractionMode,
} from "@/lib/templates/validation"

type ApiError = { error?: string }

export async function uploadAndAnalyzeTemplate({
  description,
  extractionMode,
  file,
  name,
  onProgress,
}: {
  description: string
  extractionMode: TemplateExtractionMode
  file: File
  name: string
  onProgress?: (progress: number) => void
}) {
  onProgress?.(8)
  const contentSha256 = await createFileSha256(file)
  const mimeType = file.type || DOCX_MIME_TYPE
  onProgress?.(18)

  const prepareResponse = await fetch("/api/templates/upload/prepare", {
    body: JSON.stringify({
      contentSha256,
      description,
      extractionMode,
      fileName: file.name,
      mimeType,
      name,
      size: file.size,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const prepared = (await prepareResponse
    .json()
    .catch(() => ({}))) as ApiError & {
    templateId?: string
    uploadUrl?: string
  }
  if (!prepareResponse.ok || !prepared.templateId || !prepared.uploadUrl) {
    throw new Error(
      prepared.error || "The template upload could not be prepared."
    )
  }

  onProgress?.(30)
  try {
    const uploadResponse = await fetch(prepared.uploadUrl, {
      body: file,
      headers: { "Content-Type": mimeType },
      method: "PUT",
    })
    if (!uploadResponse.ok) {
      throw new Error("The template could not be uploaded to private storage.")
    }
  } catch (error) {
    await archiveTemplateProfile(prepared.templateId).catch(() => undefined)
    throw error
  }

  onProgress?.(55)
  const analyzeResponse = await fetch(
    `/api/templates/${prepared.templateId}/analyze`,
    { method: "POST" }
  )
  const analyzed = (await analyzeResponse
    .json()
    .catch(() => ({}))) as ApiError & {
    mappings?: TemplateFieldMapping[]
    notes?: string[]
    structure?: TemplateStructure
    templateId?: string
    versionId?: string
  }
  if (
    !analyzeResponse.ok ||
    !analyzed.templateId ||
    !analyzed.versionId ||
    !analyzed.structure ||
    !analyzed.mappings
  ) {
    throw new Error(
      analyzed.error || "The DOCX could not be converted into a template."
    )
  }

  onProgress?.(100)
  return analyzed as Required<Omit<typeof analyzed, "error">>
}

export async function activateTemplateProfile({
  isDefault,
  tags,
  templateId,
}: {
  isDefault: boolean
  tags: string[]
  templateId: string
}) {
  return updateTemplate(templateId, { action: "activate", isDefault, tags })
}

export async function archiveTemplateProfile(templateId: string) {
  return updateTemplate(templateId, { action: "archive" })
}

export async function deleteTemplateProfile(templateId: string) {
  const response = await fetch(`/api/templates/${templateId}`, {
    method: "DELETE",
  })
  const payload = (await response.json().catch(() => ({}))) as ApiError
  if (!response.ok) {
    throw new Error(payload.error || "The template could not be deleted.")
  }
  return payload
}

export async function getTemplateProfiles() {
  const response = await fetch("/api/templates", { cache: "no-store" })
  const payload = (await response.json().catch(() => ({}))) as ApiError & {
    templates?: DocBotTemplateSummary[]
  }
  if (!response.ok || !payload.templates) {
    throw new Error(payload.error || "The templates could not be loaded.")
  }
  return payload.templates
}

async function updateTemplate(templateId: string, body: object) {
  const response = await fetch(`/api/templates/${templateId}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  })
  const payload = (await response.json().catch(() => ({}))) as ApiError
  if (!response.ok) {
    throw new Error(payload.error || "The template could not be updated.")
  }
  return payload
}

async function createFileSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}
