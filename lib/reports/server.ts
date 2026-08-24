import "server-only"

import { randomUUID } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  DOCX_MIME_TYPE,
  HISTORIA_CLINICA_TEMPLATE_KEY,
  renderHistoriaClinicaDocxBuffer,
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
  supabase,
  userId,
}: {
  draft: HistoriaClinicaDraft
  processingJobId: string
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
    .select("id")
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .maybeSingle()

  if (reportError) throw reportError
  let report = existingReportRow

  if (!report) {
    const reportId = randomUUID()
    const { data: insertedReport, error: insertReportError } = await supabase
      .from("docbot_reports")
      .insert({
        id: reportId,
        session_id: session.id,
        template_key: HISTORIA_CLINICA_TEMPLATE_KEY,
        user_id: userId,
      })
      .select("id")
      .single()

    if (insertReportError) {
      if (insertReportError.code !== "23505") throw insertReportError

      const { data: concurrentReport, error: concurrentReportError } =
        await supabase
          .from("docbot_reports")
          .select("id")
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

  const rendered = await renderHistoriaClinicaDocxBuffer(parsedDraft)
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
