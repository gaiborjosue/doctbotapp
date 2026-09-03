"use client"

const DATABASE_NAME = "docbot-live-recordings"
const DATABASE_VERSION = 1
const RECORDINGS_STORE = "recordings"
const CHUNKS_STORE = "chunks"
const RECORDING_CHUNKS_INDEX = "by-recording"
const TARGET_SAMPLE_RATE = 16_000
const WAV_MIME_TYPE = "audio/wav"
const WORKLET_PATH = "/audio-worklets/docbot-pcm-recorder.js"
const FLUSH_TIMEOUT_MS = 3_000

let databasePromise: Promise<IDBDatabase> | undefined

type RecordingStatus = "paused" | "recording" | "stopped"

type StoredRecording = {
  chunkCount: number
  createdAt: number
  durationMs: number
  id: string
  mimeType: typeof WAV_MIME_TYPE
  sampleCount: number
  sampleRate: typeof TARGET_SAMPLE_RATE
  status: RecordingStatus
  updatedAt: number
  userId: string
}

type StoredRecordingChunk = {
  blob: Blob
  recordingId: string
  sequence: number
}

export type LiveRecordingAsset = {
  durationMs: number
  file: File
  recordingId: string
}

export type LiveRecordingController = {
  abandon: () => void
  cancel: () => Promise<void>
  id: string
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<LiveRecordingAsset>
  stream: MediaStream
}

export async function startLiveRecording({
  onStorageError,
  userId,
}: {
  onStorageError?: (error: Error) => void
  userId: string
}): Promise<LiveRecordingController> {
  ensureRecordingSupport()

  const recordingId = crypto.randomUUID()
  const createdAt = Date.now()
  const metadata: StoredRecording = {
    chunkCount: 0,
    createdAt,
    durationMs: 0,
    id: recordingId,
    mimeType: WAV_MIME_TYPE,
    sampleCount: 0,
    sampleRate: TARGET_SAMPLE_RATE,
    status: "recording",
    updatedAt: createdAt,
    userId,
  }

  let stream: MediaStream | undefined
  let audioContext: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let worklet: AudioWorkletNode | undefined
  let writeQueue = Promise.resolve()
  let storageError: Error | undefined
  let stopped = false
  let flushResolve: (() => void) | undefined

  function releaseAudioResources() {
    source?.disconnect()
    worklet?.disconnect()
    stopStream(stream)
    void audioContext?.close().catch(() => undefined)
  }

  try {
    await discardOtherUsersRecordings(userId)
    await persistRecording(metadata)
    void navigator.storage?.persist?.().catch(() => false)

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })

    audioContext = new AudioContext({ latencyHint: "interactive" })
    await audioContext.audioWorklet.addModule(WORKLET_PATH)
    await audioContext.resume()

    source = audioContext.createMediaStreamSource(stream)
    worklet = new AudioWorkletNode(audioContext, "docbot-pcm-recorder", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })

    worklet.port.onmessage = ({ data }) => {
      if (data?.type === "flushed") {
        flushResolve?.()
        flushResolve = undefined
        return
      }

      if (
        data?.type !== "chunk" ||
        !(data.buffer instanceof ArrayBuffer) ||
        !Number.isInteger(data.sampleCount) ||
        data.sampleCount <= 0
      ) {
        return
      }

      const sequence = metadata.chunkCount
      metadata.chunkCount += 1
      metadata.sampleCount += data.sampleCount
      metadata.durationMs = Math.round(
        (metadata.sampleCount / metadata.sampleRate) * 1000
      )
      metadata.updatedAt = Date.now()
      const metadataSnapshot = { ...metadata }

      const chunk = new Blob([data.buffer], {
        type: "application/octet-stream",
      })
      writeQueue = writeQueue
        .then(() => persistRecordingChunk(metadataSnapshot, sequence, chunk))
        .catch((error) => {
          if (storageError) return
          storageError = toError(
            error,
            "The recording could not be saved locally."
          )
          onStorageError?.(storageError)
        })
    }

    source.connect(worklet)
    worklet.connect(audioContext.destination)
  } catch (error) {
    stopStream(stream)
    source?.disconnect()
    worklet?.disconnect()
    await audioContext?.close().catch(() => undefined)
    await discardLiveRecording(recordingId).catch(() => undefined)
    throw error
  }

  function abandon() {
    if (stopped) return
    stopped = true
    worklet?.port.postMessage({ type: "pause" })
    releaseAudioResources()
  }

  async function changeStatus(status: RecordingStatus) {
    if (stopped) return
    metadata.status = status
    metadata.updatedAt = Date.now()
    worklet?.port.postMessage({
      type: status === "paused" ? "pause" : "resume",
    })
    await writeQueue
    await persistRecording(metadata)
    if (storageError) throw storageError
  }

  async function stop() {
    if (stopped) {
      throw new Error("This recording has already stopped.")
    }

    stopped = true
    try {
      await flushWorklet(worklet!, (resolve) => {
        flushResolve = resolve
      })
    } finally {
      releaseAudioResources()
    }
    await writeQueue
    if (storageError) throw storageError

    metadata.status = "stopped"
    metadata.updatedAt = Date.now()
    await persistRecording(metadata)
    return loadLiveRecordingAsset(metadata)
  }

  async function cancel() {
    abandon()
    await writeQueue
    await discardLiveRecording(recordingId)
  }

  return {
    abandon,
    cancel,
    id: recordingId,
    pause: () => changeStatus("paused"),
    resume: () => changeStatus("recording"),
    stop,
    stream,
  }
}

export async function recoverLatestLiveRecording(userId: string) {
  await discardOtherUsersRecordings(userId)
  const database = await openDatabase()
  const transaction = database.transaction(RECORDINGS_STORE, "readonly")
  const recordings = await requestResult<StoredRecording[]>(
    transaction.objectStore(RECORDINGS_STORE).getAll()
  )
  await transactionDone(transaction)

  const latest = recordings
    .filter(
      (recording) => recording.userId === userId && recording.chunkCount > 0
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]

  if (!latest) return
  latest.status = "stopped"
  latest.updatedAt = Date.now()
  await persistRecording(latest)
  return loadLiveRecordingAsset(latest)
}

export async function discardLiveRecording(recordingId: string) {
  const database = await openDatabase()
  const transaction = database.transaction(
    [RECORDINGS_STORE, CHUNKS_STORE],
    "readwrite"
  )
  transaction.objectStore(RECORDINGS_STORE).delete(recordingId)

  const chunks = transaction.objectStore(CHUNKS_STORE)
  const cursorRequest = chunks
    .index(RECORDING_CHUNKS_INDEX)
    .openCursor(IDBKeyRange.only(recordingId))
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result
    if (!cursor) return
    cursor.delete()
    cursor.continue()
  }

  await transactionDone(transaction)
}

async function discardOtherUsersRecordings(userId: string) {
  const database = await openDatabase()
  const transaction = database.transaction(RECORDINGS_STORE, "readonly")
  const recordings = await requestResult<StoredRecording[]>(
    transaction.objectStore(RECORDINGS_STORE).getAll()
  )
  await transactionDone(transaction)

  await Promise.all(
    recordings
      .filter((recording) => recording.userId !== userId)
      .map((recording) => discardLiveRecording(recording.id))
  )
}

async function loadLiveRecordingAsset(recording: StoredRecording) {
  const database = await openDatabase()
  const transaction = database.transaction(CHUNKS_STORE, "readonly")
  const chunks = await requestResult<StoredRecordingChunk[]>(
    transaction
      .objectStore(CHUNKS_STORE)
      .index(RECORDING_CHUNKS_INDEX)
      .getAll(IDBKeyRange.only(recording.id))
  )
  await transactionDone(transaction)

  chunks.sort((left, right) => left.sequence - right.sequence)
  if (chunks.length === 0 || recording.sampleCount === 0) {
    throw new Error("The recovered recording does not contain audio.")
  }

  const header = createWavHeader(recording.sampleCount, recording.sampleRate)
  const fileName = `recording-${new Date(recording.createdAt)
    .toISOString()
    .replaceAll(":", "-")}.wav`
  const file = new File(
    [header, ...chunks.map((chunk) => chunk.blob)],
    fileName,
    {
      lastModified: recording.createdAt,
      type: recording.mimeType,
    }
  )

  return {
    durationMs: recording.durationMs,
    file,
    recordingId: recording.id,
  } satisfies LiveRecordingAsset
}

async function persistRecording(recording: StoredRecording) {
  const database = await openDatabase()
  const transaction = database.transaction(RECORDINGS_STORE, "readwrite")
  transaction.objectStore(RECORDINGS_STORE).put({ ...recording })
  await transactionDone(transaction)
}

async function persistRecordingChunk(
  recording: StoredRecording,
  sequence: number,
  blob: Blob
) {
  const database = await openDatabase()
  const transaction = database.transaction(
    [RECORDINGS_STORE, CHUNKS_STORE],
    "readwrite"
  )
  transaction.objectStore(CHUNKS_STORE).put({
    blob,
    recordingId: recording.id,
    sequence,
  } satisfies StoredRecordingChunk)
  transaction.objectStore(RECORDINGS_STORE).put({ ...recording })
  await transactionDone(transaction)
}

function createWavHeader(sampleCount: number, sampleRate: number) {
  const bitsPerSample = 16
  const channelCount = 1
  const dataLength = sampleCount * (bitsPerSample / 8)
  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)

  writeAscii(view, 0, "RIFF")
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(view, 8, "WAVE")
  writeAscii(view, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channelCount * (bitsPerSample / 8), true)
  view.setUint16(32, channelCount * (bitsPerSample / 8), true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(view, 36, "data")
  view.setUint32(40, dataLength, true)
  return buffer
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function flushWorklet(
  worklet: AudioWorkletNode,
  registerResolve: (resolve: () => void) => void
) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("The recorder could not finish saving its last chunk."))
    }, FLUSH_TIMEOUT_MS)

    registerResolve(() => {
      window.clearTimeout(timeout)
      resolve()
    })
    worklet.port.postMessage({ type: "flush" })
  })
}

function ensureRecordingSupport() {
  if (!window.isSecureContext) {
    throw new Error("Microphone access requires HTTPS or localhost.")
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support microphone recording.")
  }
  if (!window.AudioContext || !window.AudioWorkletNode || !window.indexedDB) {
    throw new Error("This browser cannot save live recordings reliably.")
  }
}

function stopStream(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop())
}

function openDatabase() {
  if (databasePromise) return databasePromise

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(RECORDINGS_STORE)) {
        database.createObjectStore(RECORDINGS_STORE, { keyPath: "id" })
      }
      if (!database.objectStoreNames.contains(CHUNKS_STORE)) {
        const chunks = database.createObjectStore(CHUNKS_STORE, {
          keyPath: ["recordingId", "sequence"],
        })
        chunks.createIndex(RECORDING_CHUNKS_INDEX, "recordingId")
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = undefined
      }
      resolve(database)
    }
    request.onerror = () => {
      databasePromise = undefined
      reject(request.error)
    }
    request.onblocked = () => {
      databasePromise = undefined
      reject(new Error("The local recording database is unavailable."))
    }
  })

  return databasePromise
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("The local recording was interrupted.")
      )
  })
}

function toError(error: unknown, fallback: string) {
  return error instanceof Error ? error : new Error(fallback)
}
