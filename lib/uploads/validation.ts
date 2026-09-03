export const MAX_AUDIO_BYTES = 100 * 1024 * 1024
export const MAX_CONTEXT_FILE_BYTES = 25 * 1024 * 1024
export const MAX_CONTEXT_FILES = 10
export const GEMINI_AUDIO_UPLOAD_ACCEPT =
  ".mp3,.wav,.aif,.aiff,.aac,.flac,.ogg,.oga,.opus,audio/mp3,audio/mpeg,audio/wav,audio/aiff,audio/aac,audio/flac,audio/ogg,audio/opus"

export type UploadKind = "audio" | "image" | "file"

export type UploadFileDescriptor = {
  fileName: string
  kind: UploadKind
  mimeType: string
  size: number
}

const AUDIO_EXTENSIONS = new Set([
  "aac",
  "aif",
  "aiff",
  "flac",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
])
const IMAGE_EXTENSIONS = new Set([
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "webp",
])
const FILE_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "md",
  "pdf",
  "ppt",
  "pptx",
  "rtf",
  "txt",
  "xls",
  "xlsx",
])

const FILE_MIME_TYPES = new Set([
  "application/csv",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain",
])

const FALLBACK_MIME_TYPES: Record<string, string> = {
  aac: "audio/aac",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  flac: "audio/flac",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  md: "text/markdown",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/opus",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  wav: "audio/wav",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

const GEMINI_AUDIO_MIME_TYPES: Record<string, string> = {
  aac: "audio/aac",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  flac: "audio/flac",
  mp3: "audio/mp3",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wav: "audio/wav",
}
const SUPPORTED_GEMINI_AUDIO_MIME_TYPES = new Set(
  Object.values(GEMINI_AUDIO_MIME_TYPES)
)

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? ""
}

export function resolveFileMimeType(file: Pick<File, "name" | "type">) {
  return (
    file.type.trim().toLowerCase() ||
    FALLBACK_MIME_TYPES[getExtension(file.name)] ||
    "application/octet-stream"
  )
}

export function inferContextUploadKind(
  file: Pick<File, "name" | "type">
): "image" | "file" | undefined {
  const extension = getExtension(file.name)
  const mimeType = resolveFileMimeType(file)

  if (IMAGE_EXTENSIONS.has(extension) && mimeType.startsWith("image/")) {
    return "image"
  }

  if (FILE_EXTENSIONS.has(extension) && FILE_MIME_TYPES.has(mimeType)) {
    return "file"
  }
}

export function resolveGeminiAudioMimeType(fileName: string, mimeType: string) {
  const extensionMimeType = GEMINI_AUDIO_MIME_TYPES[getExtension(fileName)]
  if (extensionMimeType) return extensionMimeType

  const normalizedMimeType = mimeType.trim().toLowerCase()
  return SUPPORTED_GEMINI_AUDIO_MIME_TYPES.has(normalizedMimeType)
    ? normalizedMimeType
    : undefined
}

export function validateUploadDescriptor(
  descriptor: UploadFileDescriptor
): string | undefined {
  const extension = getExtension(descriptor.fileName)
  const mimeType = descriptor.mimeType.trim().toLowerCase()

  if (!descriptor.fileName.trim() || descriptor.fileName.length > 255) {
    return "File names must contain between 1 and 255 characters."
  }

  if (!Number.isSafeInteger(descriptor.size) || descriptor.size <= 0) {
    return "Empty files cannot be uploaded."
  }

  if (descriptor.kind === "audio") {
    if (descriptor.size > MAX_AUDIO_BYTES) {
      return "Audio files must be 100 MB or smaller."
    }

    if (
      !AUDIO_EXTENSIONS.has(extension) ||
      !(mimeType.startsWith("audio/") || mimeType === "application/ogg")
    ) {
      return "Choose a supported audio file."
    }

    return
  }

  if (descriptor.size > MAX_CONTEXT_FILE_BYTES) {
    return "Context files must be 25 MB or smaller."
  }

  if (
    descriptor.kind === "image" &&
    (!IMAGE_EXTENSIONS.has(extension) || !mimeType.startsWith("image/"))
  ) {
    return "Choose a supported image file."
  }

  if (
    descriptor.kind === "file" &&
    (!FILE_EXTENSIONS.has(extension) || !FILE_MIME_TYPES.has(mimeType))
  ) {
    return "Choose a supported document file."
  }
}
