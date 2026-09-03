import {
  inferContextUploadKind,
  resolveFileMimeType,
  type UploadFileDescriptor,
} from "@/lib/uploads/validation"
import type { DocBotSessionSummary } from "@/lib/sessions/types"

export type UploadStage = "checking" | "uploading"
export type UploadSource = "recording" | "upload"

export type DuplicateAudioUpload = {
  fileName: string
  session: DocBotSessionSummary | null
  uploadId: string
}

export type UploadDocBotFilesResult =
  | {
      duplicate: DuplicateAudioUpload
      status: "duplicate"
    }
  | {
      fileCount: number
      status: "uploaded"
      uploadId: string
    }

type PreparedFile = {
  expiresAt: string
  fileId: string
  kind: UploadFileDescriptor["kind"]
  mimeType: string
  objectKey: string
  uploadUrl: string
}

type PrepareUploadResponse = {
  status: "prepared"
  uploadId: string
  files: PreparedFile[]
}

type DuplicateUploadResponse = {
  duplicate: DuplicateAudioUpload
  status: "duplicate"
}

export async function uploadDocBotFiles({
  audioFile,
  contextFiles,
  onProgress,
  onStage,
  source = "upload",
}: {
  audioFile: File
  contextFiles: File[]
  onProgress?: (progress: number) => void
  onStage?: (stage: UploadStage) => void
  source?: UploadSource
}): Promise<UploadDocBotFilesResult> {
  onStage?.("checking")
  onProgress?.(0)
  const contentSha256 = await createFileSha256(audioFile, onProgress)
  const sourceFiles = [audioFile, ...contextFiles]
  const descriptors: Array<UploadFileDescriptor & { contentSha256?: string }> =
    sourceFiles.map((file, index) => ({
      contentSha256: index === 0 ? contentSha256 : undefined,
      fileName: file.name,
      kind: index === 0 ? "audio" : inferContextUploadKind(file) || "file",
      mimeType: resolveFileMimeType(file),
      size: file.size,
    }))

  const prepared = await requestJson<
    PrepareUploadResponse | DuplicateUploadResponse
  >("/api/uploads/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: descriptors, source }),
  })

  if (prepared.status === "duplicate") return prepared

  if (prepared.files.length !== sourceFiles.length) {
    throw new Error("The upload service returned an incomplete file list.")
  }

  const totalBytes = sourceFiles.reduce((total, file) => total + file.size, 0)
  const uploadedBytes = new Map<string, number>()

  onStage?.("uploading")
  onProgress?.(0)

  try {
    await runWithConcurrency(
      prepared.files.map((file, index) => async () => {
        const sourceFile = sourceFiles[index]

        await uploadFile(
          file.uploadUrl,
          sourceFile,
          file.mimeType,
          (loaded) => {
            uploadedBytes.set(file.fileId, loaded)
            const totalLoaded = Array.from(uploadedBytes.values()).reduce(
              (sum, value) => sum + value,
              0
            )
            onProgress?.(
              Math.min(99, Math.round((totalLoaded / totalBytes) * 100))
            )
          }
        )
      }),
      3
    )

    const completed = await requestJson<{
      fileCount: number
      status: "uploaded"
      uploadId: string
    }>("/api/uploads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileIds: prepared.files.map((file) => file.fileId),
        uploadId: prepared.uploadId,
      }),
    })

    onProgress?.(100)
    return completed
  } catch (error) {
    await cancelPreparedUpload(prepared.uploadId)
    throw error
  }
}

async function createFileSha256(
  file: File,
  onProgress?: (progress: number) => void
) {
  const { createSHA256 } = await import("hash-wasm")
  const hasher = await createSHA256()
  const chunkSize = 2 * 1024 * 1024
  let offset = 0

  hasher.init()

  while (offset < file.size) {
    const nextOffset = Math.min(offset + chunkSize, file.size)
    const chunk = new Uint8Array(
      await file.slice(offset, nextOffset).arrayBuffer()
    )
    hasher.update(chunk)
    offset = nextOffset
    onProgress?.(Math.round((offset / file.size) * 100))
  }

  return hasher.digest("hex")
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit) {
  const response = await fetch(input, init)
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
  } & T

  if (!response.ok) {
    throw new Error(payload.error || "The upload request failed.")
  }

  return payload
}

async function cancelPreparedUpload(uploadId: string) {
  await fetch("/api/uploads/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId }),
  }).catch(() => undefined)
}

function uploadFile(
  uploadUrl: string,
  file: File,
  mimeType: string,
  onProgress: (loaded: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("PUT", uploadUrl)
    request.setRequestHeader("Content-Type", mimeType)
    request.upload.addEventListener("progress", (event) => {
      onProgress(event.lengthComputable ? event.loaded : 0)
    })
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size)
        resolve()
      } else {
        reject(new Error("R2 rejected one of the files."))
      }
    })
    request.addEventListener("error", () => {
      reject(new Error("A network error interrupted the upload."))
    })
    request.addEventListener("abort", () => {
      reject(new Error("The upload was cancelled."))
    })
    request.send(file)
  })
}

async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency: number
) {
  let nextTask = 0

  async function worker() {
    while (nextTask < tasks.length) {
      const task = tasks[nextTask]
      nextTask += 1
      await task()
    }
  }

  const results = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  )
  const failedWorker = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  )

  if (failedWorker) throw failedWorker.reason
}
