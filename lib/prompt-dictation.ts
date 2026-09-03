"use client"

import type { MicVAD } from "@ricky0123/vad-web"

const DICTATION_MIME_TYPE = "audio/wav"
const DICTATION_SAMPLE_RATE = 16_000
const VAD_ASSET_PATH = "/vad/"
export const PROMPT_DICTATION_SPEECH_END_LATENCY_MS = 800

type PromptDictationActivityHandlers = {
  onSpeechEnd?: () => void
  onSpeechRealStart?: () => void
  onSpeechStart?: () => void
  onVADMisfire?: () => void
}

export type PromptDictationRecorder = {
  segments: Float32Array[]
  stream: MediaStream
  vad: MicVAD
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop())
}

function joinSpeechSegments(segments: Float32Array[]) {
  const sampleCount = segments.reduce(
    (total, segment) => total + segment.length,
    0
  )
  const audio = new Float32Array(sampleCount)
  let offset = 0

  for (const segment of segments) {
    audio.set(segment, offset)
    offset += segment.length
  }

  return audio
}

export async function createPromptDictationRecorder(
  stream: MediaStream,
  handlers: PromptDictationActivityHandlers = {}
) {
  const { MicVAD } = await import("@ricky0123/vad-web")
  const segments: Float32Array[] = []
  let vad: MicVAD | undefined

  try {
    vad = await MicVAD.new({
      baseAssetPath: VAD_ASSET_PATH,
      getStream: async () => stream,
      minSpeechMs: 320,
      model: "v5",
      negativeSpeechThreshold: 0.35,
      onnxWASMBasePath: VAD_ASSET_PATH,
      onSpeechEnd: (audio) => {
        if (audio.length > 0) segments.push(audio.slice())
        handlers.onSpeechEnd?.()
      },
      onSpeechRealStart: handlers.onSpeechRealStart,
      onSpeechStart: handlers.onSpeechStart,
      onVADMisfire: handlers.onVADMisfire,
      ortConfig: (ort) => {
        // One thread avoids SharedArrayBuffer/cross-origin-isolation requirements
        // while keeping the VAD fully on device on mobile browsers.
        ort.env.wasm.numThreads = 1
        ort.env.wasm.proxy = false
      },
      pauseStream: async (activeStream) => stopStream(activeStream),
      positiveSpeechThreshold: 0.5,
      preSpeechPadMs: 512,
      processorType: "auto",
      redemptionMs: PROMPT_DICTATION_SPEECH_END_LATENCY_MS,
      resumeStream: async () => stream,
      startOnLoad: false,
      submitUserSpeechOnPause: true,
    })
    await vad.start()

    return { segments, stream, vad } satisfies PromptDictationRecorder
  } catch (error) {
    stopStream(stream)
    await vad?.destroy().catch(() => undefined)
    throw error
  }
}

export function cancelPromptDictationRecorder(
  dictation: PromptDictationRecorder
) {
  stopStream(dictation.stream)
  void dictation.vad.destroy().catch(() => undefined)
}

export async function stopPromptDictationRecorder(
  dictation: PromptDictationRecorder
) {
  try {
    // With submitUserSpeechOnPause enabled, this synchronously flushes a valid
    // phrase that is still in progress when the user presses Stop.
    await dictation.vad.pause()

    if (dictation.segments.length === 0) {
      throw new Error("No speech was detected. Nothing was sent.")
    }

    const samples = joinSpeechSegments(dictation.segments)
    const { utils } = await import("@ricky0123/vad-web")
    const wav = utils.encodeWAV(samples, 1, DICTATION_SAMPLE_RATE, 1, 16)
    return new Blob([wav], { type: DICTATION_MIME_TYPE })
  } finally {
    stopStream(dictation.stream)
    await dictation.vad.destroy().catch(() => undefined)
  }
}

export async function transcribePromptDictation(
  audio: Blob,
  signal?: AbortSignal
) {
  const formData = new FormData()
  formData.append("file", audio, "prompt-dictation.wav")

  const response = await fetch("/api/transcribe", {
    body: formData,
    credentials: "same-origin",
    method: "POST",
    signal,
  })
  const payload = (await response.json().catch(() => undefined)) as
    { error?: string; text?: string } | undefined

  if (!response.ok) {
    throw new Error(payload?.error || "The dictation could not be transcribed.")
  }

  const transcript = payload?.text?.trim()
  if (!transcript) {
    throw new Error("No speech was detected. Please try again.")
  }

  return transcript
}
