import "server-only"

import { createHash, randomUUID } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  createR2TemplateArtifactObjectKey,
  createR2TemplateSourceObjectKey,
  deleteR2Object,
  downloadR2Object,
  headR2Object,
  uploadBufferToR2,
} from "@/lib/r2-storage"
import type { Database, Json } from "@/lib/supabase/database.types"
import { createSanitizedClinicalTemplate } from "@/lib/templates/docx-sample"
import { normalizeStoredTemplateMappings } from "@/lib/templates/manifest"
import type {
  DocBotTemplateSummary,
  TemplateStructure,
} from "@/lib/templates/types"
import {
  DOCX_MIME_TYPE,
  normalizeTagName,
  sessionTagsSchema,
  templateRuleTagsSchema,
  type TemplateExtractionMode,
} from "@/lib/templates/validation"

type DbClient = SupabaseClient<Database>

export type ResolvedCustomTemplate = {
  objectKey: string
  templateId: string
  templateKey: string
  templateVersionId: string
}

export async function createTemplateUploadRecord({
  contentSha256,
  description,
  extractionMode,
  fileName,
  mimeType,
  name,
  size,
  supabase,
  userId,
}: {
  contentSha256: string
  description: string
  extractionMode: TemplateExtractionMode
  fileName: string
  mimeType: string
  name: string
  size: number
  supabase: DbClient
  userId: string
}) {
  const templateId = randomUUID()
  const versionId = randomUUID()
  const sourceObjectKey = createR2TemplateSourceObjectKey({
    fileName,
    templateId,
    userId,
    versionId,
  })

  const { error: templateError } = await supabase
    .from("docbot_templates")
    .insert({
      description: description || null,
      id: templateId,
      name,
      user_id: userId,
    })
  if (templateError) {
    throw new Error("Unable to create the template profile.", {
      cause: templateError,
    })
  }

  const { error: versionError } = await supabase
    .from("docbot_template_versions")
    .insert({
      extraction_mode: extractionMode,
      id: versionId,
      source_content_sha256: contentSha256,
      source_file_name: fileName,
      source_mime_type: mimeType,
      source_object_key: sourceObjectKey,
      source_size_bytes: size,
      template_id: templateId,
      user_id: userId,
      version_number: 1,
    })
  if (versionError) {
    await supabase
      .from("docbot_templates")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", templateId)
      .eq("user_id", userId)
    throw new Error("Unable to create the template version.", {
      cause: versionError,
    })
  }

  return { sourceObjectKey, templateId, versionId }
}

export async function analyzeTemplateVersion({
  supabase,
  templateId,
  userId,
}: {
  supabase: DbClient
  templateId: string
  userId: string
}) {
  const { data: template, error: templateError } = await supabase
    .from("docbot_templates")
    .select("id, name")
    .eq("id", templateId)
    .eq("user_id", userId)
    .maybeSingle()
  if (templateError) throw templateError
  if (!template) throw new Error("Template not found.")

  const { data: version, error: versionError } = await supabase
    .from("docbot_template_versions")
    .select(
      "id, extraction_mode, source_content_sha256, source_file_name, source_mime_type, source_object_key, source_size_bytes, status, version_number"
    )
    .eq("template_id", templateId)
    .eq("user_id", userId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (versionError) throw versionError
  if (!version?.source_object_key || version.status !== "uploaded") {
    throw new Error("This template version is not ready for analysis.")
  }

  const now = new Date().toISOString()
  const { error: analyzingError } = await supabase
    .from("docbot_template_versions")
    .update({ status: "analyzing" })
    .eq("id", version.id)
    .eq("template_id", templateId)
    .eq("user_id", userId)
    .eq("status", "uploaded")
  if (analyzingError) throw analyzingError

  const sourceObjectKey = version.source_object_key
  try {
    const sourceMetadata = await headR2Object(sourceObjectKey)
    if (!sourceMetadata?.size) {
      throw new Error("The uploaded template file was not found.")
    }
    if (sourceMetadata.size !== version.source_size_bytes) {
      throw new Error("The uploaded template size does not match the request.")
    }
    if (
      sourceMetadata.contentType &&
      sourceMetadata.contentType !== version.source_mime_type
    ) {
      throw new Error("The uploaded template content type does not match.")
    }

    const { body } = await downloadR2Object(sourceObjectKey)
    const actualSha256 = createHash("sha256").update(body).digest("hex")
    if (actualSha256 !== version.source_content_sha256) {
      throw new Error("The uploaded template checksum does not match.")
    }
    const sanitized = await createSanitizedClinicalTemplate({
      documentBytes: body,
      extractionMode: version.extraction_mode as TemplateExtractionMode,
    })
    const artifactObjectKey = createR2TemplateArtifactObjectKey({
      templateId,
      userId,
      versionId: version.id,
    })
    await uploadBufferToR2({
      body: sanitized.buffer,
      contentType: DOCX_MIME_TYPE,
      objectKey: artifactObjectKey,
    })

    const fileName = `${safeFileStem(template.name)}-template-v${version.version_number}.docx`
    const { error: readyError } = await supabase
      .from("docbot_template_versions")
      .update({
        analysis_notes: toJson(sanitized.notes),
        analyzed_at: now,
        failure_message: null,
        field_mappings: toJson(sanitized.mappings),
        sanitized_file_name: fileName,
        sanitized_object_key: artifactObjectKey,
        source_object_key: null,
        status: "ready",
        structure_json: toJson(sanitized.structure),
      })
      .eq("id", version.id)
      .eq("template_id", templateId)
      .eq("user_id", userId)
    if (readyError) {
      await deleteR2Object(artifactObjectKey).catch(() => undefined)
      throw readyError
    }

    await deleteR2Object(sourceObjectKey).catch(() => undefined)
    return {
      mappings: sanitized.mappings,
      notes: sanitized.notes,
      structure: sanitized.structure,
      templateId,
      versionId: version.id,
    }
  } catch (error) {
    await deleteR2Object(sourceObjectKey).catch(() => undefined)
    await supabase
      .from("docbot_template_versions")
      .update({
        failure_message: getSafeAnalysisError(error),
        source_object_key: null,
        status: "failed",
      })
      .eq("id", version.id)
      .eq("template_id", templateId)
      .eq("user_id", userId)
    throw error
  }
}

export async function activateTemplate({
  isDefault,
  supabase,
  tags,
  templateId,
  userId,
}: {
  isDefault: boolean
  supabase: DbClient
  tags: string[]
  templateId: string
  userId: string
}) {
  const parsedTags = templateRuleTagsSchema.parse(tags)
  const { data: version, error: versionError } = await supabase
    .from("docbot_template_versions")
    .select("id, status, version_number")
    .eq("template_id", templateId)
    .eq("user_id", userId)
    .eq("status", "ready")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (versionError) throw versionError
  if (!version) throw new Error("The template has not passed analysis yet.")

  if (isDefault) {
    const { error: clearDefaultError } = await supabase
      .from("docbot_templates")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_default", true)
    if (clearDefaultError) throw clearDefaultError
  }

  const { error: activationError } = await supabase
    .from("docbot_templates")
    .update({
      current_version_id: version.id,
      is_default: isDefault,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .eq("user_id", userId)
  if (activationError) throw activationError

  const tagRows = await ensureTags({ supabase, tags: parsedTags, userId })
  const { error: deleteRulesError } = await supabase
    .from("docbot_template_tag_rules")
    .delete()
    .eq("template_id", templateId)
    .eq("user_id", userId)
  if (deleteRulesError) throw deleteRulesError

  if (tagRows.length > 0) {
    const { error: routeError } = await supabase
      .from("docbot_template_tag_rules")
      .upsert(
        tagRows.map((tag) => ({
          tag_id: tag.id,
          template_id: templateId,
          user_id: userId,
        })),
        { onConflict: "user_id,tag_id" }
      )
    if (routeError) throw routeError
  }

  return { templateId, versionId: version.id }
}

export async function archiveTemplate({
  supabase,
  templateId,
  userId,
}: {
  supabase: DbClient
  templateId: string
  userId: string
}) {
  const { data: temporaryVersions, error: versionsError } = await supabase
    .from("docbot_template_versions")
    .select("id, source_object_key")
    .eq("template_id", templateId)
    .eq("user_id", userId)
    .not("source_object_key", "is", null)
  if (versionsError) throw versionsError

  for (const version of temporaryVersions) {
    if (version.source_object_key) {
      await deleteR2Object(version.source_object_key).catch(() => undefined)
    }
  }
  if (temporaryVersions.length > 0) {
    const { error: cleanupError } = await supabase
      .from("docbot_template_versions")
      .update({
        failure_message: "Template setup was cancelled.",
        source_object_key: null,
        status: "failed",
      })
      .eq("template_id", templateId)
      .eq("user_id", userId)
      .not("source_object_key", "is", null)
    if (cleanupError) throw cleanupError
  }

  const { error } = await supabase
    .from("docbot_templates")
    .update({
      is_default: false,
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .eq("user_id", userId)
  if (error) throw error
}

export async function deleteTemplate({
  supabase,
  templateId,
  userId,
}: {
  supabase: DbClient
  templateId: string
  userId: string
}) {
  const { data: template, error: templateError } = await supabase
    .from("docbot_templates")
    .select("id")
    .eq("id", templateId)
    .eq("user_id", userId)
    .maybeSingle()
  if (templateError) throw templateError
  if (!template) throw new Error("Template not found.")

  const { data: versions, error: versionsError } = await supabase
    .from("docbot_template_versions")
    .select("id, source_object_key, sanitized_object_key")
    .eq("template_id", templateId)
    .eq("user_id", userId)
  if (versionsError) throw versionsError

  const objectKeys = [
    ...new Set(
      versions.flatMap((version) =>
        [version.source_object_key, version.sanitized_object_key].filter(
          (key): key is string => Boolean(key)
        )
      )
    ),
  ]

  // Delete private artifacts first to avoid leaving inaccessible clinical files
  // behind. R2 deletes are idempotent, so a later database failure can be retried.
  await Promise.all(objectKeys.map((objectKey) => deleteR2Object(objectKey)))

  const versionIds = versions.map((version) => version.id)
  if (versionIds.length > 0) {
    const { error: reportsError } = await supabase
      .from("docbot_reports")
      .update({
        template_version_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .in("template_version_id", versionIds)
    if (reportsError) throw reportsError
  }

  const { data: deletedTemplate, error: deleteError } = await supabase
    .from("docbot_templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle()
  if (deleteError) throw deleteError
  if (!deletedTemplate) throw new Error("Template not found.")

  return {
    deletedObjectCount: objectKeys.length,
    templateId: deletedTemplate.id,
  }
}

export async function listTemplates(
  supabase: DbClient,
  userId: string
): Promise<DocBotTemplateSummary[]> {
  const { data: templates, error } = await supabase
    .from("docbot_templates")
    .select(
      "id, name, description, status, is_default, current_version_id, created_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
  if (error) throw error
  if (templates.length === 0) return []

  const templateIds = templates.map((template) => template.id)
  const [
    { data: versions, error: versionsError },
    { data: rules, error: rulesError },
  ] = await Promise.all([
    supabase
      .from("docbot_template_versions")
      .select(
        "id, template_id, version_number, status, extraction_mode, field_mappings, structure_json"
      )
      .in("template_id", templateIds)
      .eq("user_id", userId)
      .order("version_number", { ascending: false }),
    supabase
      .from("docbot_template_tag_rules")
      .select("template_id, tag_id")
      .in("template_id", templateIds)
      .eq("user_id", userId)
      .eq("enabled", true),
  ])
  if (versionsError) throw versionsError
  if (rulesError) throw rulesError

  const tagIds = [...new Set((rules ?? []).map((rule) => rule.tag_id))]
  const { data: tags, error: tagsError } = tagIds.length
    ? await supabase
        .from("docbot_tags")
        .select("id, name")
        .in("id", tagIds)
        .eq("user_id", userId)
    : { data: [], error: null }
  if (tagsError) throw tagsError

  const versionById = new Map(
    (versions ?? []).map((version) => [version.id, version])
  )
  const latestVersionByTemplate = new Map<
    string,
    NonNullable<typeof versions>[number]
  >()
  for (const version of versions ?? []) {
    if (!latestVersionByTemplate.has(version.template_id)) {
      latestVersionByTemplate.set(version.template_id, version)
    }
  }
  const tagNameById = new Map((tags ?? []).map((tag) => [tag.id, tag.name]))

  return templates.map((template) => {
    const version =
      (template.current_version_id
        ? versionById.get(template.current_version_id)
        : undefined) ?? latestVersionByTemplate.get(template.id)
    const mappings = normalizeStoredTemplateMappings(version?.field_mappings)
    return {
      createdAt: template.created_at,
      description: template.description,
      extractionMode:
        (version?.extraction_mode as TemplateExtractionMode | undefined) ??
        null,
      id: template.id,
      isDefault: template.is_default,
      mappingCount: mappings.length,
      mappings,
      name: template.name,
      status: template.status as DocBotTemplateSummary["status"],
      structure:
        version?.structure_json &&
        typeof version.structure_json === "object" &&
        !Array.isArray(version.structure_json)
          ? (version.structure_json as unknown as TemplateStructure)
          : null,
      tags: (rules ?? [])
        .filter((rule) => rule.template_id === template.id)
        .map((rule) => tagNameById.get(rule.tag_id))
        .filter((name): name is string => Boolean(name)),
      versionId: version?.id ?? null,
      versionNumber: version?.version_number ?? null,
      versionStatus:
        (version?.status as DocBotTemplateSummary["versionStatus"]) ?? null,
    }
  })
}

export async function replaceUploadTags({
  supabase,
  tags,
  uploadId,
  userId,
}: {
  supabase: DbClient
  tags: string[]
  uploadId: string
  userId: string
}) {
  const parsedTags = sessionTagsSchema.parse(tags)
  const { error: clearError } = await supabase
    .from("docbot_upload_tags")
    .delete()
    .eq("upload_id", uploadId)
    .eq("user_id", userId)
  if (clearError) throw clearError

  const tagRows = await ensureTags({ supabase, tags: parsedTags, userId })
  if (tagRows.length === 0) return

  const { error } = await supabase.from("docbot_upload_tags").insert(
    tagRows.map((tag) => ({
      tag_id: tag.id,
      upload_id: uploadId,
      user_id: userId,
    }))
  )
  if (error) throw error
}

export async function resolveCustomTemplateForSession({
  sessionId,
  supabase,
  userId,
}: {
  sessionId: string
  supabase: DbClient
  userId: string
}): Promise<ResolvedCustomTemplate | null> {
  const { data: sessionTags, error: sessionTagsError } = await supabase
    .from("docbot_session_tags")
    .select("tag_id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
  if (sessionTagsError) throw sessionTagsError

  let templateId: string | undefined
  if (sessionTags.length > 0) {
    const { data: rules, error: rulesError } = await supabase
      .from("docbot_template_tag_rules")
      .select("template_id, priority, updated_at")
      .in(
        "tag_id",
        sessionTags.map((tag) => tag.tag_id)
      )
      .eq("user_id", userId)
      .eq("enabled", true)
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("template_id", { ascending: true })
      .limit(1)
    if (rulesError) throw rulesError
    templateId = rules[0]?.template_id
  }

  const template = templateId
    ? await findActiveTemplate(supabase, userId, { templateId })
    : null
  const selectedTemplate =
    template ??
    (await findActiveTemplate(supabase, userId, { isDefault: true }))
  if (!selectedTemplate?.current_version_id) return null

  const { data: version, error: versionError } = await supabase
    .from("docbot_template_versions")
    .select("id, sanitized_object_key, status, version_number")
    .eq("id", selectedTemplate.current_version_id)
    .eq("template_id", selectedTemplate.id)
    .eq("user_id", userId)
    .maybeSingle()
  if (versionError) throw versionError
  if (version?.status !== "ready" || !version.sanitized_object_key) return null

  return {
    objectKey: version.sanitized_object_key,
    templateId: selectedTemplate.id,
    templateKey: `custom:${selectedTemplate.id}:v${version.version_number}`,
    templateVersionId: version.id,
  }
}

async function findActiveTemplate(
  supabase: DbClient,
  userId: string,
  selector: { isDefault?: boolean; templateId?: string }
) {
  let query = supabase
    .from("docbot_templates")
    .select("id, current_version_id")
    .eq("user_id", userId)
    .eq("status", "active")

  if (selector.templateId) query = query.eq("id", selector.templateId)
  if (selector.isDefault) query = query.eq("is_default", true)

  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw error
  return data
}

async function ensureTags({
  supabase,
  tags,
  userId,
}: {
  supabase: DbClient
  tags: string[]
  userId: string
}) {
  if (tags.length === 0) return []

  const rows = tags.map((name) => ({
    name,
    normalized_name: normalizeTagName(name),
    user_id: userId,
    updated_at: new Date().toISOString(),
  }))
  const { error: upsertError } = await supabase
    .from("docbot_tags")
    .upsert(rows, { onConflict: "user_id,normalized_name" })
  if (upsertError) throw upsertError

  const { data, error } = await supabase
    .from("docbot_tags")
    .select("id, name, normalized_name")
    .eq("user_id", userId)
    .in(
      "normalized_name",
      rows.map((row) => row.normalized_name)
    )
  if (error) throw error
  return data
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Json
}

function safeFileStem(value: string) {
  return (
    value
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "docbot"
  )
}

function getSafeAnalysisError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 1_000)
}
