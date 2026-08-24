import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

const XAI_STT_URL = "https://api.x.ai/v1/stt"
const MAX_DICTATION_BYTES = 12 * 1024 * 1024
const XAI_TIMEOUT_MS = 55_000

type XaiTranscriptionResponse = {
  text?: unknown
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    console.error("[api/transcribe] XAI_API_KEY is not configured")
    return Response.json(
      { error: "Voice dictation is not configured." },
      { status: 503 }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return Response.json(
        { error: "An audio recording is required." },
        { status: 400 }
      )
    }
    if (file.size === 0) {
      return Response.json(
        { error: "The audio recording is empty." },
        { status: 400 }
      )
    }
    if (file.size > MAX_DICTATION_BYTES) {
      return Response.json(
        { error: "Dictation is limited to short recordings." },
        { status: 413 }
      )
    }
    if (file.type && !file.type.startsWith("audio/")) {
      return Response.json(
        { error: "The uploaded file must contain audio." },
        { status: 415 }
      )
    }

    const xaiFormData = new FormData()
    xaiFormData.append("format", "true")
    xaiFormData.append("language", "es")
    xaiFormData.append("file", file, file.name || "prompt-dictation.wav")

    const xaiResponse = await fetch(XAI_STT_URL, {
      body: xaiFormData,
      headers: { Authorization: `Bearer ${apiKey}` },
      method: "POST",
      signal: AbortSignal.timeout(XAI_TIMEOUT_MS),
    })
    const responseText = await xaiResponse.text()

    if (!xaiResponse.ok) {
      console.error("[api/transcribe] xAI request failed", {
        status: xaiResponse.status,
      })
      return Response.json(
        {
          error:
            xaiResponse.status === 429
              ? "Voice dictation is busy. Please try again shortly."
              : "The dictation could not be transcribed.",
        },
        { status: xaiResponse.status === 429 ? 503 : 502 }
      )
    }

    const result = JSON.parse(responseText) as XaiTranscriptionResponse
    const transcript = typeof result.text === "string" ? result.text.trim() : ""
    if (!transcript) {
      return Response.json(
        { error: "No speech was detected. Please try again." },
        { status: 422 }
      )
    }

    return Response.json(
      { text: transcript },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    const isTimeout =
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")

    console.error("[api/transcribe] failed", {
      message: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      {
        error: isTimeout
          ? "The dictation took too long to transcribe. Please try again."
          : "The dictation could not be transcribed.",
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
