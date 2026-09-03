export type AudioProcessingStatus =
  | "preparing"
  | "queued"
  | "in_progress"
  | "requires_action"
  | "completed"
  | "failed"
  | "cancelled"
  | "incomplete"
  | "budget_exceeded"

export type AudioProcessingJob = {
  errorMessage: string | null
  jobId: string
  model: string
  outputText: string | null
  retryAfterMs: number | null
  status: AudioProcessingStatus
}

export async function startUploadedAudioProcessing(
  uploadId: string,
  { force = false, tags = [] }: { force?: boolean; tags?: string[] } = {}
) {
  return await requestProcessingJob("/api/processing/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force, tags, uploadId }),
  })
}

export async function getUploadedAudioProcessingJob(
  jobId: string,
  signal?: AbortSignal
) {
  return await requestProcessingJob(`/api/processing/audio/${jobId}`, {
    method: "GET",
    cache: "no-store",
    signal,
  })
}

export function isAudioProcessingFailure(status: AudioProcessingStatus) {
  return [
    "requires_action",
    "failed",
    "cancelled",
    "incomplete",
    "budget_exceeded",
  ].includes(status)
}

async function requestProcessingJob(input: string, init: RequestInit) {
  const response = await fetch(input, init)
  const payload = (await response.json().catch(() => ({}))) as Partial<
    AudioProcessingJob & { error: string }
  >

  if (!response.ok) {
    throw new Error(payload.error || "The audio could not be processed.")
  }

  if (!payload.jobId || !payload.status || !payload.model) {
    throw new Error("The processing service returned an invalid response.")
  }

  return payload as AudioProcessingJob
}
