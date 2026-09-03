import "server-only"

import { randomUUID } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  DOCX_MIME_TYPE,
  HISTORIA_CLINICA_TEMPLATE_KEY,
  renderHistoriaClinicaDocxBuffer,
  renderHistoriaClinicaDocxTemplateBuffer,
} from "@/lib/historia-clinica-docx"
import {
  historiaClinicaDraftSchema,
  type HistoriaClinicaDraft,
} from "@/lib/historia-clinica-schema"
import {
  createR2ReportObjectKey,
  deleteR2Object,
  downloadR2Object,
  uploadBufferToR2,
} from "@/lib/r2-storage"
import {
  applyClinicalDocumentReplacements,
  readClinicalDocumentText,
  type ClinicalDocumentReplacement,
} from "@/lib/reports/docx-editor"
import type { Database, Json } from "@/lib/supabase/database.types"
import { normalizeStoredTemplateMappings } from "@/lib/templates/manifest"
import { createResolvedCustomTemplateRenderData } from "@/lib/templates/slot-values"
import { resolveCustomTemplateForSession } from "@/lib/templates/server"
import type { TemplateExtractionMode } from "@/lib/templates/validation"

export type DocBotReportContext = {
  clinicalJson: HistoriaClinicaDraft
  currentRevisionId: string
  documentFileName: string
  documentObjectKey: string
  documentText: string
  reportId: string
  revisionNumber: number
}

export async function getCurrentDocBotReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
): Promise<DocBotReportContext | null> {
  const { data: report, error: reportError } = await supabase
    .from("docbot_reports")
    .select("id, current_revision_id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle()

  if (reportError) {
    throw new Error("Unable to load the clinical report.", {
      cause: reportError,
    })
  }
  if (!report?.current_revision_id) return null

  const { data: revision, error: revisionError } = await supabase
    .from("docbot_report_revisions")
    .select(
      "id, report_id, revision_number, clinical_json, document_object_key, document_file_name, document_text"
    )
    .eq("id", report.current_revision_id)
    .eq("report_id", report.id)
    .eq("user_id", userId)
    .maybeSingle()

  if (revisionError) {
    throw new Error("Unable to load the current report revision.", {
      cause: revisionError,
    })
  }
  if (!revision) return null

  return {
    clinicalJson: historiaClinicaDraftSchema.parse(revision.clinical_json),
    currentRevisionId: revision.id,
    documentFileName: revision.document_file_name,
    documentObjectKey: revision.document_object_key,
    documentText: revision.document_text,
    reportId: revision.report_id,
    revisionNumber: revision.revision_number,
  }
}

export async function createInitialDocBotReport({
  draft,
  processingJobId,
  sourceEvidence,
  supabase,
  userId,
}: {
  draft: HistoriaClinicaDraft
  processingJobId: string
  sourceEvidence: string
  supabase: SupabaseClient<Database>
  userId: string
}) {
  const parsedDraft = historiaClinicaDraftSchema.parse(draft)
  const { data: session, error: sessionError } = await supabase
    .from("docbot_sessions")
    .select("id, title")
    .eq("processing_job_id", processingJobId)
    .eq("user_id", userId)
    .maybeSingle()

  if (sessionError) {
    throw new Error("Unable to locate the new DocBot session.", {
      cause: sessionError,
    })
  }
  if (!session) {
    throw new Error("The completed processing job did not create a session.")
  }

  const existingReport = await getCurrentDocBotReport(
    supabase,
    userId,
    session.id
  )
  if (existingReport) return existingReport

  const { data: existingReportRow, error: reportError } = await supabase
    .from("docbot_reports")
    .select("id, template_key, template_version_id")
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .maybeSingle()

  if (reportError) throw reportError
  let report = existingReportRow

  if (!report) {
    const selectedTemplate = await resolveCustomTemplateForSession({
      sessionId: session.id,
      supabase,
      userId,
    })
    const reportId = randomUUID()
    const { data: insertedReport, error: insertReportError } = await supabase
      .from("docbot_reports")
      .insert({
        id: reportId,
        session_id: session.id,
        template_key:
          selectedTemplate?.templateKey ?? HISTORIA_CLINICA_TEMPLATE_KEY,
        template_version_id: selectedTemplate?.templateVersionId ?? null,
        user_id: userId,
      })
      .select("id, template_key, template_version_id")
      .single()

    if (insertReportError) {
      if (insertReportError.code !== "23505") throw insertReportError

      const { data: concurrentReport, error: concurrentReportError } =
        await supabase
          .from("docbot_reports")
          .select("id, template_key, template_version_id")
          .eq("session_id", session.id)
          .eq("user_id", userId)
          .single()

      if (concurrentReportError) throw concurrentReportError
      report = concurrentReport
    } else {
      report = insertedReport
    }
  }

  const { data: existingRevision, error: existingRevisionError } =
    await supabase
      .from("docbot_report_revisions")
      .select("id")
      .eq("report_id", report.id)
      .eq("revision_number", 1)
      .eq("user_id", userId)
      .maybeSingle()

  if (existingRevisionError) throw existingRevisionError
  if (existingRevision) {
    await setCurrentRevision({
      reportId: report.id,
      revisionId: existingRevision.id,
      supabase,
      userId,
    })
    return getRequiredCurrentReport(supabase, userId, session.id)
  }

  const rendered = report.template_version_id
    ? await renderPinnedCustomTemplate({
        draft: parsedDraft,
        sourceEvidence,
        supabase,
        templateKey: report.template_key,
        templateVersionId: report.template_version_id,
        userId,
      }).catch(async (error) => {
        console.error(
          "[reports] custom template render failed; using built-in",
          {
            message: error instanceof Error ? error.message : String(error),
            sessionId: session.id,
            templateVersionId: report.template_version_id,
          }
        )
        await supabase
          .from("docbot_reports")
          .update({
            template_key: HISTORIA_CLINICA_TEMPLATE_KEY,
            template_version_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", report.id)
          .eq("user_id", userId)
        return renderHistoriaClinicaDocxBuffer(parsedDraft)
      })
    : await renderHistoriaClinicaDocxBuffer(parsedDraft)
  const documentText = await readClinicalDocumentText(rendered.buffer)
  const revisionId = randomUUID()
  const documentObjectKey = createR2ReportObjectKey({
    reportId: report.id,
    revisionId,
    revisionNumber: 1,
    sessionId: session.id,
    userId,
  })
  const documentFileName = createClinicalDocumentFileName(session.title)

  await uploadBufferToR2({
    body: rendered.buffer,
    contentType: DOCX_MIME_TYPE,
    objectKey: documentObjectKey,
  })

  const { error: revisionError } = await supabase
    .from("docbot_report_revisions")
    .insert({
      change_summary: "Initial report generated from the Gemini clinical JSON.",
      clinical_json: toJson(parsedDraft),
      document_file_name: documentFileName,
      document_mime_type: DOCX_MIME_TYPE,
      document_object_key: documentObjectKey,
      document_text: documentText,
      id: revisionId,
      report_id: report.id,
      revision_number: 1,
      source_processing_job_id: processingJobId,
      user_id: userId,
    })

  if (revisionError) {
    await deleteR2Object(documentObjectKey).catch(() => undefined)
    throw new Error("Unable to persist the initial report revision.", {
      cause: revisionError,
    })
  }

  await setCurrentRevision({
    reportId: report.id,
    revisionId,
    supabase,
    userId,
  })

  return getRequiredCurrentReport(supabase, userId, session.id)
}

async function renderPinnedCustomTemplate({
  draft,
  sourceEvidence,
  supabase,
  templateKey,
  templateVersionId,
  userId,
}: {
  draft: HistoriaClinicaDraft
  sourceEvidence: string
  supabase: SupabaseClient<Database>
  templateKey: string
  templateVersionId: string
  userId: string
}) {
  const { data: version, error } = await supabase
    .from("docbot_template_versions")
    .select("extraction_mode, field_mappings, sanitized_object_key, status")
    .eq("id", templateVersionId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  if (version?.status !== "ready" || !version.sanitized_object_key) {
    throw new Error("The pinned custom template artifact is unavailable.")
  }

  const { body } = await downloadR2Object(version.sanitized_object_key)
  const mappings = normalizeStoredTemplateMappings(version.field_mappings)
  if (mappings.length === 0) {
    throw new Error("The pinned custom template has no usable slot manifest.")
  }
  const templateData = await createResolvedCustomTemplateRenderData({
    draft,
    extractionMode: version.extraction_mode as TemplateExtractionMode,
    mappings,
    sourceEvidence,
  })
  return renderHistoriaClinicaDocxTemplateBuffer({
    draft,
    templateBuffer: body,
    templateData,
    templateKey,
  })
}

export async function editCurrentDocBotReport({
  changeSummary,
  originatingMessageId,
  replacements,
  sessionId,
  supabase,
  userId,
}: {
  changeSummary: string
  originatingMessageId?: string
  replacements: ClinicalDocumentReplacement[]
  sessionId: string
  supabase: SupabaseClient<Database>
  userId: string
}) {
  const current = await getCurrentDocBotReport(supabase, userId, sessionId)
  if (!current) {
    throw new Error("This session does not have a generated clinical report.")
  }

  const { body } = await downloadR2Object(current.documentObjectKey)
  const edited = await applyClinicalDocumentReplacements({
    documentBytes: body,
    replacements,
  })

  if (edited.replacementCount === 0) {
    return {
      documentFileName: current.documentFileName,
      missingSearches: edited.operationResults.map((result) => result.search),
      replacementCount: 0,
      revisionNumber: current.revisionNumber,
      updated: false as const,
    }
  }

  const revisionId = randomUUID()
  const revisionNumber = current.revisionNumber + 1
  const documentObjectKey = createR2ReportObjectKey({
    reportId: current.reportId,
    revisionId,
    revisionNumber,
    sessionId,
    userId,
  })

  await uploadBufferToR2({
    body: edited.documentBytes,
    contentType: DOCX_MIME_TYPE,
    objectKey: documentObjectKey,
  })

  const { error: revisionError } = await supabase
    .from("docbot_report_revisions")
    .insert({
      change_summary: changeSummary.trim().slice(0, 1200),
      clinical_json: toJson(current.clinicalJson),
      document_file_name: current.documentFileName,
      document_mime_type: DOCX_MIME_TYPE,
      document_object_key: documentObjectKey,
      document_text: edited.documentText,
      id: revisionId,
      originating_message_id: originatingMessageId,
      report_id: current.reportId,
      revision_number: revisionNumber,
      user_id: userId,
    })

  if (revisionError) {
    await deleteR2Object(documentObjectKey).catch(() => undefined)
    throw new Error("Unable to persist the edited report revision.", {
      cause: revisionError,
    })
  }

  await setCurrentRevision({
    reportId: current.reportId,
    revisionId,
    supabase,
    userId,
  })

  return {
    documentFileName: current.documentFileName,
    downloadPath: `/api/sessions/${sessionId}/document`,
    missingSearches: edited.operationResults
      .filter((result) => result.replacementCount === 0)
      .map((result) => result.search),
    replacementCount: edited.replacementCount,
    revisionNumber,
    updated: true as const,
  }
}

async function setCurrentRevision({
  reportId,
  revisionId,
  supabase,
  userId,
}: {
  reportId: string
  revisionId: string
  supabase: SupabaseClient<Database>
  userId: string
}) {
  const { error } = await supabase
    .from("docbot_reports")
    .update({
      current_revision_id: revisionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .eq("user_id", userId)

  if (error) {
    throw new Error("Unable to activate the report revision.", { cause: error })
  }
}

async function getRequiredCurrentReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
) {
  const report = await getCurrentDocBotReport(supabase, userId, sessionId)
  if (!report)
    throw new Error("The clinical report revision was not activated.")
  return report
}

function createClinicalDocumentFileName(sessionTitle: string) {
  const slug =
    sessionTitle
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "consulta"

  return `historia-clinica-${slug}.docx`
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}
