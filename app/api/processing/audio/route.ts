import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  createGeminiAudioSummaryInteraction,
  GEMINI_AUDIO_MODEL_ID,
  getGeminiAudioErrorMessage,
  isGeminiAudioInteractionTerminal,
} from "@/lib/gemini-audio"
import { createR2PresignedGetUrl } from "@/lib/r2-storage"
import { createInitialDocBotReport } from "@/lib/reports/server"
import {
  GEMINI_SESSION_TITLE_MODEL_ID,
  generateAndPersistDocBotSessionTitle,
} from "@/lib/session-title"
import type { Json, Tables } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"
import { replaceUploadTags } from "@/lib/templates/server"
import { sessionTagsSchema } from "@/lib/templates/validation"
import {
  MAX_AUDIO_BYTES,
  resolveGeminiAudioMimeType,
} from "@/lib/uploads/validation"

export const runtime = "nodejs"
export const maxDuration = 300

const requestSchema = z.object({
  force: z.boolean().optional().default(false),
  tags: sessionTagsSchema.optional().default([]),
  uploadId: z.string().uuid(),
})

const REUSABLE_JOB_STATUSES = [
  "preparing",
  "queued",
  "in_progress",
  "completed",
] as const

type ProcessingJob = Tables<"docbot_processing_jobs">

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  try {
    const requestBody = await request.json().catch(() => undefined)
    const parsedRequest = requestSchema.safeParse(requestBody)
    if (!parsedRequest.success) {
      return Response.json(
        { error: "The processing request is invalid." },
        { status: 400 }
      )
    }

    const payload = parsedRequest.data
    const { data: upload, error: uploadError } = await supabase
      .from("docbot_uploads")
      .select("id, status")
      .eq("id", payload.uploadId)
      .eq("user_id", claims.sub)
      .maybeSingle()

    if (uploadError) throw uploadError
    if (!upload) {
      return Response.json({ error: "Upload not found." }, { status: 404 })
    }

    if (
      !["uploaded", "processing", "ready", "failed"].includes(upload.status)
    ) {
      return Response.json(
        { error: "The audio upload has not finished yet." },
        { status: 409 }
      )
    }

    await replaceUploadTags({
      supabase,
      tags: payload.tags,
      uploadId: upload.id,
      userId: claims.sub,
    })

    const reusableJob = await findReusableJob({
      includeCompleted: !payload.force,
      supabase,
      uploadId: upload.id,
      userId: claims.sub,
    })
    if (reusableJob) return processingJobResponse(reusableJob)

    const { data: audioFile, error: audioError } = await supabase
      .from("docbot_upload_files")
      .select("id, mime_type, object_key, original_name, size_bytes, status")
      .eq("upload_id", upload.id)
      .eq("user_id", claims.sub)
      .eq("kind", "audio")
      .maybeSingle()

    if (audioError) throw audioError
    if (!audioFile || audioFile.status !== "uploaded") {
      return Response.json(
        { error: "A verified audio file was not found for this upload." },
        { status: 409 }
      )
    }

    if (audioFile.size_bytes > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: "Gemini audio processing supports files up to 100 MB." },
        { status: 413 }
      )
    }

    const geminiMimeType = resolveGeminiAudioMimeType(
      audioFile.original_name,
      audioFile.mime_type
    )
    if (!geminiMimeType) {
      return Response.json(
        { error: "This audio format is not supported by Gemini 2.5 Flash." },
        { status: 415 }
      )
    }

    const jobId = randomUUID()
    const { data: job, error: jobError } = await supabase
      .from("docbot_processing_jobs")
      .insert({
        id: jobId,
        model: GEMINI_AUDIO_MODEL_ID,
        provider: "google",
        status: "preparing",
        upload_id: upload.id,
        user_id: claims.sub,
      })
      .select("*")
      .single()

    if (jobError) {
      if (jobError.code === "23505") {
        const concurrentJob = await findReusableJob({
          includeCompleted: false,
          supabase,
          uploadId: upload.id,
          userId: claims.sub,
        })
        if (concurrentJob) return processingJobResponse(concurrentJob)
      }

      throw jobError
    }

    let interactionId: string | undefined

    try {
      const { downloadUrl } = await createR2PresignedGetUrl(
        audioFile.object_key
      )
      const interaction = await createGeminiAudioSummaryInteraction({
        audioUrl: downloadUrl,
        mimeType: geminiMimeType,
      })
      interactionId = interaction.interactionId

      const submittedAt = new Date().toISOString()
      const isTerminal = isGeminiAudioInteractionTerminal(interaction.status)
      const { data: submittedJob, error: submittedJobError } = await supabase
        .from("docbot_processing_jobs")
        .update({
          completed_at: isTerminal ? submittedAt : null,
          error_message: interaction.errorMessage,
          evidence_text: interaction.evidenceText,
          interaction_id: interaction.interactionId,
          last_polled_at: submittedAt,
          output_json: interaction.outputJson
            ? toJson(interaction.outputJson)
            : null,
          output_text: interaction.outputText,
          status: interaction.status,
          submitted_at: submittedAt,
          updated_at: submittedAt,
        })
        .eq("id", job.id)
        .eq("user_id", claims.sub)
        .select("*")
        .single()

      if (submittedJobError) throw submittedJobError

      if (interaction.status === "completed") {
        if (!interaction.outputJson) {
          throw new Error("Gemini did not return a valid clinical record.")
        }
        const sourceEvidence =
          interaction.evidenceText ?? interaction.outputText
        if (!sourceEvidence) {
          throw new Error("Gemini did not return grounded clinical evidence.")
        }

        if (interaction.outputText) {
          await generateAndPersistDocBotSessionTitle({
            processingJobId: job.id,
            sourceSummary: interaction.outputText,
            supabase,
            userId: claims.sub,
          }).catch((error) => {
            console.error("[api/processing/audio] title generation failed", {
              jobId: job.id,
              message: error instanceof Error ? error.message : String(error),
              model: GEMINI_SESSION_TITLE_MODEL_ID,
            })
          })
        }

        await createInitialDocBotReport({
          draft: interaction.outputJson,
          processingJobId: job.id,
          sourceEvidence,
          supabase,
          userId: claims.sub,
        })
      }

      const uploadStatus =
        interaction.status === "completed"
          ? "ready"
          : isTerminal
            ? "failed"
            : "processing"
      const { error: uploadStatusError } = await supabase
        .from("docbot_uploads")
        .update({ status: uploadStatus, updated_at: submittedAt })
        .eq("id", upload.id)
        .eq("user_id", claims.sub)

      if (uploadStatusError) throw uploadStatusError

      return processingJobResponse(submittedJob, 201)
    } catch (error) {
      const failedAt = new Date().toISOString()
      const providerError = getGeminiAudioErrorMessage(error)
      await supabase
        .from("docbot_sessions")
        .delete()
        .eq("processing_job_id", job.id)
        .eq("user_id", claims.sub)
      await supabase
        .from("docbot_processing_jobs")
        .update({
          completed_at: failedAt,
          error_message:
            providerError || "The Gemini interaction could not be started.",
          interaction_id: interactionId,
          status: "failed",
          updated_at: failedAt,
        })
        .eq("id", job.id)
        .eq("user_id", claims.sub)
      await supabase
        .from("docbot_uploads")
        .update({ status: "failed", updated_at: failedAt })
        .eq("id", upload.id)
        .eq("user_id", claims.sub)

      console.error("[api/processing/audio] processing failed", {
        jobId: job.id,
        message: providerError,
      })

      return Response.json(
        {
          error: providerError || "The audio could not be submitted to Gemini.",
        },
        { status: 502 }
      )
    }
  } catch (error) {
    console.error("[api/processing/audio] failed", {
      message: error instanceof Error ? error.message : String(error),
    })

    return Response.json(
      { error: "The audio processing job could not be created." },
      { status: 500 }
    )
  }
}

async function findReusableJob({
  includeCompleted,
  supabase,
  uploadId,
  userId,
}: {
  includeCompleted: boolean
  supabase: Awaited<ReturnType<typeof createClient>>
  uploadId: string
  userId: string
}) {
  const statuses = includeCompleted
    ? [...REUSABLE_JOB_STATUSES]
    : REUSABLE_JOB_STATUSES.filter((status) => status !== "completed")
  const { data, error } = await supabase
    .from("docbot_processing_jobs")
    .select("*")
    .eq("upload_id", uploadId)
    .eq("user_id", userId)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

function processingJobResponse(job: ProcessingJob, status = 200) {
  return Response.json(
    {
      errorMessage: job.error_message,
      jobId: job.id,
      model: job.model,
      outputText: job.output_text,
      retryAfterMs: ["preparing", "queued", "in_progress"].includes(job.status)
        ? 3000
        : null,
      status: job.status,
    },
    { status, headers: { "Cache-Control": "no-store" } }
  )
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}
