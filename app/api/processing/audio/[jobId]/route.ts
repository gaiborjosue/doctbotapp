import { z } from "zod"

import type { Tables } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const POLL_INTERVAL_MS = 3000
const PREPARING_TIMEOUT_MS = 60_000
const TERMINAL_STATUSES = new Set([
  "requires_action",
  "completed",
  "failed",
  "cancelled",
  "incomplete",
  "budget_exceeded",
])

type ProcessingJob = Tables<"docbot_processing_jobs">

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  const { jobId } = await params
  if (!z.string().uuid().safeParse(jobId).success) {
    return Response.json(
      { error: "The processing job ID is invalid." },
      { status: 400 }
    )
  }

  const { data: job, error: jobError } = await supabase
    .from("docbot_processing_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", claims.sub)
    .maybeSingle()

  if (jobError) {
    console.error("[api/processing/audio/job] lookup failed", {
      jobId,
      message: jobError.message,
    })
    return Response.json(
      { error: "The processing job could not be loaded." },
      { status: 500 }
    )
  }

  if (!job) {
    return Response.json(
      { error: "Processing job not found." },
      { status: 404 }
    )
  }

  if (TERMINAL_STATUSES.has(job.status)) return processingJobResponse(job)

  const preparingForMs = Date.now() - new Date(job.created_at).getTime()
  if (preparingForMs < PREPARING_TIMEOUT_MS) {
    return processingJobResponse(job)
  }

  const failedAt = new Date().toISOString()
  const { data: failedJob } = await supabase
    .from("docbot_processing_jobs")
    .update({
      completed_at: failedAt,
      error_message:
        "The synchronous Gemini request did not finish. Please try again.",
      status: "failed",
      updated_at: failedAt,
    })
    .eq("id", job.id)
    .eq("user_id", claims.sub)
    .select("*")
    .single()

  await supabase
    .from("docbot_uploads")
    .update({ status: "failed", updated_at: failedAt })
    .eq("id", job.upload_id)
    .eq("user_id", claims.sub)

  return processingJobResponse(failedJob ?? job)
}

function processingJobResponse(job: ProcessingJob) {
  return Response.json(
    {
      errorMessage: job.error_message,
      jobId: job.id,
      model: job.model,
      outputText: job.output_text,
      retryAfterMs: TERMINAL_STATUSES.has(job.status)
        ? null
        : POLL_INTERVAL_MS,
      status: job.status,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
