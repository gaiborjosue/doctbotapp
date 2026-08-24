"use client"

import {
  Avatar as RuntimeAvatar,
  type AvatarProps,
} from "@bible-strong/avatar-react"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  AudioLinesIcon,
  CameraIcon,
  CameraOffIcon,
  CheckCircle2Icon,
  CheckIcon,
  DownloadIcon,
  FileAudioIcon,
  ImagesIcon,
  MicIcon,
  PaperclipIcon,
  PauseIcon,
  PencilLineIcon,
  PlayIcon,
  SquareIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ChangeEvent,
  DragEvent,
  PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { AvatarPickerDialog } from "@/components/avatar-picker-dialog"
import { ChatHistorySidebar } from "@/components/chat-history-sidebar"
import { ClinicalDocumentChangePreview } from "@/components/clinical-document-change-preview"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import {
  Tool,
  ToolContent,
  ToolHeader,
  type ToolPart,
} from "@/components/ai-elements/tool"
import { useDocBotProfile } from "@/components/docbot-profile-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  FamilyDrawerAnimatedContent,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerButton,
  FamilyDrawerClose,
  FamilyDrawerContent,
  FamilyDrawerHeader,
  FamilyDrawerOverlay,
  FamilyDrawerPortal,
  FamilyDrawerRoot,
  useFamilyDrawer,
} from "@/components/ui/family-drawer"
import { PopoverForm } from "@/components/ui/popover-form"
import { Separator } from "@/components/ui/separator"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { ShimmeringText } from "@/components/ui/shimmering-text"
import { TimerDisplay, TimerIcon, TimerRoot } from "@/components/ui/timer"
import { LiveWaveform } from "@/components/ui/live-waveform"
import {
  createCustomizedDefinition,
  getAvatarColors,
  getAvatarOption,
  type AvatarColors,
  type AvatarDefinitionJson,
  type AvatarRenderer,
} from "@/lib/avatars/registry"
import type { DocBotUIMessage } from "@/lib/agents/docbot-agent"
import { DOCBOT_CONTEXT_TOKEN_LIMIT } from "@/lib/chat/context-types"
import {
  discardLiveRecording,
  recoverLatestLiveRecording,
  startLiveRecording,
  type LiveRecordingController,
} from "@/lib/live-recording"
import type { AuthenticatedUser } from "@/lib/supabase/types"
import {
  cancelPromptDictationRecorder,
  createPromptDictationRecorder,
  PROMPT_DICTATION_SPEECH_END_LATENCY_MS,
  type PromptDictationRecorder,
  stopPromptDictationRecorder,
  transcribePromptDictation,
} from "@/lib/prompt-dictation"
import {
  getUploadedAudioProcessingJob,
  isAudioProcessingFailure,
  startUploadedAudioProcessing,
  type AudioProcessingJob,
} from "@/lib/processing/client"
import {
  archiveDocBotSession as archiveDocBotSessionRequest,
  deleteDocBotSession as deleteDocBotSessionRequest,
  getDocBotConversation,
  getDocBotSessions,
  renameDocBotSession as renameDocBotSessionRequest,
  unarchiveDocBotSession as unarchiveDocBotSessionRequest,
} from "@/lib/sessions/client"
import type { DocBotSessionSummary } from "@/lib/sessions/types"
import {
  uploadDocBotFiles,
  type DuplicateAudioUpload,
  type UploadDocBotFilesResult,
  type UploadStage,
} from "@/lib/uploads/client"
import {
  GEMINI_AUDIO_UPLOAD_ACCEPT,
  inferContextUploadKind,
  MAX_CONTEXT_FILES,
  resolveFileMimeType,
  validateUploadDescriptor,
} from "@/lib/uploads/validation"
import { cn } from "@/lib/utils"

type FollowExpression =
  | "neutral"
  | "upward-side-glance"
  | "downward-gaze"
  | "curious-left"
  | "far-right-glance"

type ProcessingState = "idle" | "processing" | "success" | "failure"
type ProcessingSource = "recording" | "upload"
type ChatTransitionPhase = "processing" | "plopping-out" | "chat"
type ChatAgentState = "idle" | "processing" | "success" | "happy"
type PromptDictationState = "idle" | "requesting" | "recording" | "transcribing"
type PromptDictationActivity = "waiting" | "speaking" | "pausing"

const CHAT_SUCCESS_FLASH_DURATION = 1150
const CHAT_INACTIVITY_DELAY = 10_000
const CHAT_AVATAR_PLOP_OUT_DURATION = 280
const PROMPT_DICTATION_MAX_DURATION = 90_000
const PROMPT_DICTATION_SILENCE_DURATION = 8_000
const PROMPT_DICTATION_SILENCE_TIMER_DURATION =
  PROMPT_DICTATION_SILENCE_DURATION - PROMPT_DICTATION_SPEECH_END_LATENCY_MS

function getDocBotThinkingMessage(isStreaming: boolean, duration?: number) {
  if (isStreaming || duration === 0) {
    return (
      <ShimmeringText
        text="Thinking…"
        duration={0.9}
        repeatDelay={0.1}
        startOnView={false}
      />
    )
  }

  return (
    <span>
      {duration === undefined
        ? "Thought for a few seconds"
        : `Thought for ${duration} second${duration === 1 ? "" : "s"}`}
    </span>
  )
}

function appendPromptTranscript(current: string, transcript: string) {
  if (!current) return transcript
  return `${current}${/\s$/.test(current) ? "" : " "}${transcript}`
}

function getMicrophoneErrorMessage(error: unknown) {
  if (!window.isSecureContext) {
    return "Microphone access requires HTTPS or localhost."
  }

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Microphone access was denied. Allow it in your browser settings and try again."
    }
    if (error.name === "NotFoundError") {
      return "No microphone was found on this device."
    }
    if (error.name === "NotReadableError") {
      return "The microphone is already in use by another application."
    }
  }

  if (
    error instanceof Error &&
    /audio context|model|onnx|vad|wasm|worklet/i.test(error.message)
  ) {
    return "On-device voice detection could not be started. Please try again."
  }

  return error instanceof Error
    ? error.message
    : "The microphone could not be started."
}

function CustomColorAvatar({
  colors,
  source,
  ...props
}: Omit<AvatarProps, "definition"> & {
  colors: AvatarColors
  source: AvatarDefinitionJson
}) {
  const customizedDefinition = useMemo(
    () => createCustomizedDefinition(source, colors.body, colors.eyes),
    [colors.body, colors.eyes, source]
  )

  return (
    <RuntimeAvatar
      definition={customizedDefinition as AvatarProps["definition"]}
      {...props}
    />
  )
}

function ChatMessageAvatar({
  SuccessAvatar,
  agentState,
  avatarColors,
  avatarDefinition,
  hasEntered,
  isExiting,
  isListening,
  isTyping,
  layoutId,
  reduceMotion,
  onEntered,
}: {
  SuccessAvatar: AvatarRenderer
  agentState: ChatAgentState
  avatarColors: AvatarColors
  avatarDefinition: AvatarDefinitionJson
  hasEntered: boolean
  isExiting: boolean
  isListening: boolean
  isTyping: boolean
  layoutId: string
  reduceMotion: boolean | null
  onEntered: () => void
}) {
  const animation =
    agentState === "processing"
      ? "working"
      : isListening
        ? "listening"
        : isTyping
          ? "thinking"
          : agentState === "happy"
            ? "happy"
            : "sleeping"

  return (
    <motion.div
      layout
      layoutId={layoutId}
      layoutCrossfade={false}
      className="relative mt-0.5 flex size-10 items-center justify-center self-start"
      aria-hidden={isExiting}
      initial={
        reduceMotion || hasEntered ? false : { opacity: 0, scale: 0.12, y: -6 }
      }
      animate={
        reduceMotion
          ? { opacity: isExiting ? 0 : 1, scale: isExiting ? 0 : 1, y: 0 }
          : isExiting
            ? {
                opacity: [1, 1, 0],
                scale: [1, 1.08, 0.06],
                y: [0, -2, 7],
              }
            : { opacity: 1, scale: 1, y: 0 }
      }
      transition={
        isExiting
          ? {
              duration: reduceMotion ? 0 : CHAT_AVATAR_PLOP_OUT_DURATION / 1000,
              ease: ["easeOut", "easeIn"],
              times: [0, 0.22, 1],
            }
          : {
              layout: {
                duration: reduceMotion ? 0 : 0.5,
                ease: "easeInOut",
              },
              opacity: { duration: reduceMotion ? 0 : 0.12 },
              scale: {
                type: "spring",
                stiffness: 520,
                damping: 17,
                mass: 0.65,
              },
              y: {
                type: "spring",
                stiffness: 520,
                damping: 20,
                mass: 0.65,
              },
            }
      }
      onAnimationComplete={isExiting ? undefined : onEntered}
    >
      <div
        className="pointer-events-none absolute size-8 rounded-full bg-foreground/15 blur-md"
        aria-hidden="true"
      />
      <div className="relative flex size-[38px] items-center justify-center">
        <CustomColorAvatar
          colors={avatarColors}
          source={avatarDefinition}
          {...(agentState === "success"
            ? { expression: "joyful-wide" as const }
            : { animation })}
          size={38}
          ariaLabel={
            agentState === "success"
              ? "DocBot successfully completed its response"
              : agentState === "processing"
                ? "DocBot working on a response"
                : isListening
                  ? "DocBot listening while the user dictates"
                  : isTyping
                    ? "DocBot thinking while the user types"
                    : agentState === "happy"
                      ? "DocBot happily waiting for the next message"
                      : "DocBot sleeping while idle"
          }
        />
        {agentState === "success" ? (
          <motion.div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={
              reduceMotion ? { opacity: 0.75 } : { opacity: [0, 1, 0.9, 0] }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    duration: CHAT_SUCCESS_FLASH_DURATION / 1000,
                    times: [0, 0.14, 0.32, 1],
                    ease: ["easeOut", "linear", "easeInOut"],
                  }
            }
          >
            <SuccessAvatar
              expression="joyful-wide"
              size={38}
              ariaLabel="Successful response color flash"
            />
          </motion.div>
        ) : null}
      </div>
    </motion.div>
  )
}

function getChatMessageText(message: DocBotUIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
}

function DocumentEditTool({
  children,
  state,
}: {
  children: ReactNode
  state: ToolPart["state"]
}) {
  const [openOverride, setOpenOverride] = useState<boolean>()
  const open =
    openOverride ?? (state !== "input-streaming" && state !== "input-available")

  return (
    <Tool
      className="mb-0 max-w-md overflow-hidden bg-muted/15 text-xs"
      onOpenChange={setOpenOverride}
      open={open}
    >
      {children}
    </Tool>
  )
}

const RECORDING_NOTICE_STORAGE_KEY = "docbot-hide-browser-recording-notice"

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60

  return `${minutes.toString().padStart(2, "0")}:${remainder
    .toString()
    .padStart(2, "0")}`
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 Bytes"

  const units = ["Bytes", "KB", "MB", "GB"]
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const size = bytes / 1024 ** unitIndex

  return `${size < 10 && unitIndex > 0 ? size.toFixed(1) : Math.round(size)} ${units[unitIndex]}`
}

function RecordingDecision({
  duration,
  onContinueExisting,
  onDiscard,
  onDiscardConfirmationChange,
  onProcessAgain,
  onSave,
}: {
  duration: number
  onContinueExisting: (session: DocBotSessionSummary) => void
  onDiscard: () => void
  onDiscardConfirmationChange: (confirming: boolean) => void
  onProcessAgain: (uploadId: string) => void
  onSave: (
    onProgress: (progress: number) => void,
    onStage: (stage: UploadStage) => void
  ) => Promise<UploadDocBotFilesResult>
}) {
  const { view, setView } = useFamilyDrawer()
  const [duplicateAudio, setDuplicateAudio] = useState<DuplicateAudioUpload>()
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveStage, setSaveStage] = useState<UploadStage>("checking")

  async function saveRecording() {
    if (isSaving) return

    setIsSaving(true)
    setSaveError(undefined)
    setSaveProgress(0)
    setSaveStage("checking")

    try {
      const result = await onSave(setSaveProgress, setSaveStage)
      if (result.status === "duplicate") setDuplicateAudio(result.duplicate)
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The recording could not be saved. Please try again."
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (view === "discard") {
    return (
      <div>
        <FamilyDrawerHeader
          icon={
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangleIcon className="size-5" aria-hidden="true" />
            </div>
          }
          title="Discard this recording?"
          description="This recording will be removed and you’ll return to the ready screen."
        />

        <div className="mt-6 flex flex-col gap-3">
          <FamilyDrawerButton
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              setView("default")
              onDiscard()
            }}
          >
            <Trash2Icon aria-hidden="true" />
            Discard recording
          </FamilyDrawerButton>
          <FamilyDrawerButton
            className="border border-border bg-background text-foreground hover:bg-muted"
            onClick={() => {
              setView("default")
              onDiscardConfirmationChange(false)
            }}
          >
            <ArrowLeftIcon aria-hidden="true" />
            Keep this recording
          </FamilyDrawerButton>
        </div>
      </div>
    )
  }

  return (
    <div>
      <FamilyDrawerHeader
        icon={
          <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CheckIcon className="size-5" aria-hidden="true" />
          </div>
        }
        title="Recording complete"
        description="Your audio is ready. Save it to continue, or discard it."
      />

      <div className="mt-5 flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
        <span className="text-sm text-muted-foreground">Duration</span>
        <span className="font-mono text-sm font-medium tabular-nums">
          {formatDuration(duration)}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <PopoverForm
          align="end"
          className="disabled:pointer-events-none disabled:opacity-60"
          collapsedWidth="100%"
          disabled={isSaving}
          height={156}
          open={Boolean(duplicateAudio)}
          setOpen={(open) => {
            if (!open) setDuplicateAudio(undefined)
          }}
          showCloseButton
          title="Duplicate audio"
          triggerIcon={<ArrowRightIcon aria-hidden="true" />}
          triggerLabel={
            isSaving
              ? saveStage === "checking"
                ? `Checking ${saveProgress}%`
                : `Uploading ${saveProgress}%`
              : "Save & continue"
          }
          triggerVariant="default"
          width="100%"
          onTrigger={() => void saveRecording()}
          openChild={
            <div className="flex h-full flex-col px-3 pt-9 pb-3">
              <p className="text-xs leading-5 text-muted-foreground">
                This exact recording is already stored. Continue with the
                existing session or process it again without uploading another
                copy.
              </p>
              <div className="mt-auto flex items-center justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant={duplicateAudio?.session ? "outline" : "default"}
                  onClick={() => {
                    if (!duplicateAudio) return
                    const { uploadId } = duplicateAudio
                    setDuplicateAudio(undefined)
                    onProcessAgain(uploadId)
                  }}
                >
                  Process again
                </Button>
                {duplicateAudio?.session ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      const session = duplicateAudio.session
                      if (!session) return
                      setDuplicateAudio(undefined)
                      onContinueExisting(session)
                    }}
                  >
                    Existing session
                  </Button>
                ) : null}
              </div>
            </div>
          }
        />
        {isSaving ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              animate={{ width: `${saveProgress}%` }}
              className="h-full rounded-full bg-foreground"
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
          </div>
        ) : null}
        {saveError ? (
          <p className="text-center text-xs text-destructive" role="alert">
            {saveError}
          </p>
        ) : null}
        <FamilyDrawerButton
          className="border border-border bg-background text-destructive hover:bg-destructive/10"
          disabled={isSaving}
          onClick={() => {
            setView("discard")
            onDiscardConfirmationChange(true)
          }}
        >
          <Trash2Icon aria-hidden="true" />
          Discard recording
        </FamilyDrawerButton>
      </div>
    </div>
  )
}

function getCameraErrorMessage(error: unknown) {
  if (!window.isSecureContext) {
    return "Camera access requires HTTPS or localhost."
  }

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera access was denied. Allow camera permission in your browser settings, or choose an image instead."
    }

    if (error.name === "NotFoundError") {
      return "No camera was found on this device."
    }

    if (error.name === "NotReadableError") {
      return "The camera is already in use by another application."
    }
  }

  return "The camera could not be started. You can choose an image instead."
}

function CameraCaptureView({ onCapture }: { onCapture: (file: File) => void }) {
  const { setView } = useFamilyDrawer()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fallbackInputRef = useRef<HTMLInputElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [cameraError, setCameraError] = useState<string>()

  useEffect(() => {
    let isActive = true

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (isActive) {
          setCameraError(
            window.isSecureContext
              ? "This browser does not support live camera access."
              : "Camera access requires HTTPS or localhost."
          )
        }
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        })

        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => undefined)
        }
      } catch (error) {
        if (isActive) setCameraError(getCameraErrorMessage(error))
      }
    }

    void startCamera()

    return () => {
      isActive = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) videoRef.current.srcObject = null
  }

  function goBack() {
    stopCamera()
    setView("default")
  }

  async function capturePhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

    setIsCapturing(true)

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")?.drawImage(video, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    })

    setIsCapturing(false)

    if (!blob) {
      setCameraError("The photo could not be captured. Please try again.")
      return
    }

    const photo = new File([blob], `context-photo-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    })

    onCapture(photo)
    stopCamera()
    setView("default")
  }

  function chooseFallbackImage(event: ChangeEvent<HTMLInputElement>) {
    const image = event.target.files?.[0]
    event.target.value = ""

    if (!image) return

    onCapture(image)
    stopCamera()
    setView("default")
  }

  return (
    <div>
      <FamilyDrawerHeader
        icon={
          <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CameraIcon className="size-5" aria-hidden="true" />
          </div>
        }
        title="Take a context photo"
        description="Photograph a relevant document or detail to attach as optional context."
      />

      <div className="relative mt-5 aspect-4/3 overflow-hidden rounded-xl border bg-muted">
        {cameraError ? (
          <div className="flex size-full flex-col items-center justify-center px-6 text-center">
            <CameraOffIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium">Camera unavailable</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {cameraError}
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="size-full object-cover"
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setIsReady(true)}
              aria-label="Live camera preview"
            />
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">
                Requesting camera access…
              </div>
            )}
          </>
        )}
      </div>

      <input
        ref={fallbackInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={chooseFallbackImage}
        tabIndex={-1}
      />

      <div className="mt-6 grid grid-cols-2 gap-3">
        <FamilyDrawerButton
          className="border border-border bg-background text-foreground hover:bg-muted"
          onClick={goBack}
        >
          <ArrowLeftIcon aria-hidden="true" />
          Back
        </FamilyDrawerButton>
        {cameraError ? (
          <FamilyDrawerButton onClick={() => fallbackInputRef.current?.click()}>
            <ImagesIcon aria-hidden="true" />
            Choose image
          </FamilyDrawerButton>
        ) : (
          <FamilyDrawerButton
            onClick={() => void capturePhoto()}
            className="disabled:pointer-events-none disabled:opacity-50"
            disabled={!isReady || isCapturing}
          >
            <CameraIcon aria-hidden="true" />
            {isCapturing ? "Capturing…" : "Capture photo"}
          </FamilyDrawerButton>
        )}
      </div>
    </div>
  )
}

function AudioUploadFlow({
  file,
  contextFiles,
  onChooseFile,
  onAddContextFiles,
  onClearFile,
  onClearContextFiles,
  onDone,
  onContinueExisting,
  onProcessAgain,
  onUpload,
}: {
  file?: File
  contextFiles: File[]
  onChooseFile: (file: File) => void
  onAddContextFiles: (files: File[]) => void
  onClearFile: () => void
  onClearContextFiles: () => void
  onDone: () => void
  onContinueExisting: (session: DocBotSessionSummary) => void
  onProcessAgain: (uploadId: string) => void
  onUpload: (
    file: File,
    contextFiles: File[],
    onProgress: (progress: number) => void,
    onStage: (stage: UploadStage) => void
  ) => Promise<UploadDocBotFilesResult>
}) {
  const { view, setView } = useFamilyDrawer()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contextInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState<UploadStage>("checking")
  const [duplicateAudio, setDuplicateAudio] = useState<DuplicateAudioUpload>()
  const [fileError, setFileError] = useState<string>()
  const shouldReduceMotion = useReducedMotion()

  function chooseFile(candidate?: File) {
    if (!candidate) return

    const validationError = validateUploadDescriptor({
      fileName: candidate.name,
      kind: "audio",
      mimeType: resolveFileMimeType(candidate),
      size: candidate.size,
    })

    if (validationError) {
      setFileError(validationError)
      return
    }

    setFileError(undefined)
    onChooseFile(candidate)
  }

  function selectAudio(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0])
    event.target.value = ""
  }

  function dropAudio(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setIsDragging(false)
    chooseFile(event.dataTransfer.files[0])
  }

  function addContextFiles(files: File[]) {
    if (contextFiles.length + files.length > MAX_CONTEXT_FILES) {
      setFileError(`Add up to ${MAX_CONTEXT_FILES} context files.`)
      return
    }

    for (const candidate of files) {
      const kind = inferContextUploadKind(candidate)
      if (!kind) {
        setFileError("Choose a supported image or document file.")
        return
      }

      const validationError = validateUploadDescriptor({
        fileName: candidate.name,
        kind,
        mimeType: resolveFileMimeType(candidate),
        size: candidate.size,
      })
      if (validationError) {
        setFileError(validationError)
        return
      }
    }

    setFileError(undefined)
    onAddContextFiles(files)
  }

  function selectContextFiles(event: ChangeEvent<HTMLInputElement>) {
    addContextFiles(Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  async function uploadFiles() {
    if (!file || isUploading) return

    setIsUploading(true)
    setUploadProgress(0)
    setUploadStage("checking")
    setFileError(undefined)

    try {
      const result = await onUpload(
        file,
        contextFiles,
        setUploadProgress,
        setUploadStage
      )

      if (result.status === "duplicate") {
        setDuplicateAudio(result.duplicate)
        return
      }

      setView("complete")
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : "The files could not be uploaded. Please try again."
      )
    } finally {
      setIsUploading(false)
    }
  }

  if (view === "camera") {
    return <CameraCaptureView onCapture={(photo) => addContextFiles([photo])} />
  }

  if (view === "preview" && file) {
    return (
      <div>
        <FamilyDrawerHeader
          icon={
            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <FileAudioIcon className="size-5" aria-hidden="true" />
            </div>
          }
          title="Review audio"
          description="Check the selected file before continuing."
        />

        <div className="mt-5 flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
            <FileAudioIcon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </p>
          </div>
        </div>

        {contextFiles.length > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm">
            <PaperclipIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span>
              {contextFiles.length} optional context{" "}
              {contextFiles.length === 1 ? "file" : "files"} attached
            </span>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <FamilyDrawerButton
            className="border border-border bg-background text-foreground hover:bg-muted"
            onClick={() => {
              onClearFile()
              setView("default")
            }}
          >
            <ArrowLeftIcon aria-hidden="true" />
            Choose another
          </FamilyDrawerButton>
          <FamilyDrawerButton onClick={() => setView("confirm")}>
            Continue
            <ArrowRightIcon aria-hidden="true" />
          </FamilyDrawerButton>
        </div>
      </div>
    )
  }

  if (view === "confirm" && file) {
    return (
      <>
        <div>
          <FamilyDrawerHeader
            icon={
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CheckCircle2Icon className="size-5" aria-hidden="true" />
              </div>
            }
            title="Ready to upload"
            description="Confirm this audio file to continue."
          />

          <div className="mt-5 flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">File</span>
              <span className="max-w-52 truncate font-medium">{file.name}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Size</span>
              <span className="font-medium">{formatFileSize(file.size)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Context</span>
              <span className="font-medium">
                {contextFiles.length === 0
                  ? "No files"
                  : `${contextFiles.length} ${contextFiles.length === 1 ? "file" : "files"}`}
              </span>
            </div>
          </div>

          {isUploading ? (
            <div className="mt-4" aria-live="polite">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {uploadStage === "checking"
                    ? "Checking for matching audio"
                    : "Uploading securely to R2"}
                </span>
                <span className="font-mono tabular-nums">
                  {uploadProgress}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-foreground"
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                />
              </div>
            </div>
          ) : null}

          {fileError ? (
            <p
              className="mt-4 text-center text-xs leading-5 text-destructive"
              role="alert"
            >
              {fileError}
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <FamilyDrawerButton
              className="border border-border bg-background text-foreground hover:bg-muted"
              onClick={() => setView("preview")}
              disabled={isUploading}
            >
              <ArrowLeftIcon aria-hidden="true" />
              Back
            </FamilyDrawerButton>
            <PopoverForm
              open={Boolean(duplicateAudio)}
              setOpen={(open) => {
                if (!open) setDuplicateAudio(undefined)
              }}
              align="end"
              collapsedWidth="100%"
              width="calc(200% + 0.75rem)"
              height={156}
              title="Duplicate audio"
              triggerLabel={
                isUploading
                  ? uploadStage === "checking"
                    ? `Checking ${uploadProgress}%`
                    : `Uploading ${uploadProgress}%`
                  : "Upload audio"
              }
              triggerIcon={<UploadIcon aria-hidden="true" />}
              triggerVariant="default"
              onTrigger={() => void uploadFiles()}
              disabled={isUploading}
              className="disabled:pointer-events-none disabled:opacity-60"
              showCloseButton
              openChild={
                <div className="flex h-full flex-col px-3 pt-9 pb-3">
                  <p className="text-xs leading-5 text-muted-foreground">
                    This exact audio is already stored. Choose where to
                    continue; DocBot won&apos;t upload another copy.
                    {contextFiles.length > 0
                      ? " New context files will be skipped."
                      : ""}
                  </p>
                  <div className="mt-auto flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant={duplicateAudio?.session ? "outline" : "default"}
                      size="sm"
                      onClick={() => {
                        if (!duplicateAudio) return
                        const { uploadId } = duplicateAudio
                        setDuplicateAudio(undefined)
                        onProcessAgain(uploadId)
                      }}
                    >
                      Process again
                    </Button>
                    {duplicateAudio?.session ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          const session = duplicateAudio.session
                          if (!session) return
                          setDuplicateAudio(undefined)
                          onContinueExisting(session)
                        }}
                      >
                        Existing session
                      </Button>
                    ) : null}
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </>
    )
  }

  if (view === "complete" && file) {
    return (
      <div>
        <FamilyDrawerHeader
          icon={
            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CheckIcon className="size-5" aria-hidden="true" />
            </div>
          }
          title="Audio ready"
          description={
            contextFiles.length > 0
              ? `Your audio and ${contextFiles.length} context ${contextFiles.length === 1 ? "file is" : "files are"} securely stored and ready.`
              : "Your audio file is securely stored and ready for the next step."
          }
        />

        <div className="mt-5 flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
          <CheckCircle2Icon
            className="size-5 shrink-0 text-foreground"
            aria-hidden="true"
          />
          <p className="min-w-0 truncate text-sm font-medium">{file.name}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <FamilyDrawerButton
            onClick={() => {
              setView("default")
              onDone()
            }}
          >
            Done
          </FamilyDrawerButton>
          <FamilyDrawerButton
            className="border border-border bg-background text-foreground hover:bg-muted"
            onClick={() => {
              onClearFile()
              onClearContextFiles()
              setView("default")
            }}
          >
            Upload another file
          </FamilyDrawerButton>
        </div>
      </div>
    )
  }

  return (
    <div>
      <FamilyDrawerHeader
        icon={
          <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <UploadIcon className="size-5" aria-hidden="true" />
          </div>
        }
        title="Upload audio"
        description="Add an audio file, plus optional photos or documents for extra context."
      />

      <motion.div
        className="mt-5 grid"
        animate={{
          gridTemplateColumns: file
            ? "minmax(0, 1fr) 6rem"
            : "minmax(0, 1fr) 0rem",
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.35,
          ease: "easeInOut",
        }}
      >
        <button
          type="button"
          className={cn(
            "flex min-h-52 w-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
            isDragging && "border-foreground bg-muted/60"
          )}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault()
            setIsDragging(false)
          }}
          onDrop={dropAudio}
        >
          {file ? (
            <>
              <FileAudioIcon
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="mt-3 max-w-full truncate text-sm font-medium">
                {file.name}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {formatFileSize(file.size)} · Select to replace
              </span>
            </>
          ) : (
            <>
              <UploadIcon
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="mt-3 text-sm font-medium">
                {isDragging ? "Drop audio here" : "Add required audio"}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                Drop or browse
              </span>
            </>
          )}
        </button>

        <AnimatePresence initial={false}>
          {file ? (
            <motion.div
              key="optional-context-actions"
              className="flex min-h-52 flex-col gap-3 overflow-hidden pl-4"
              initial={{ opacity: 0, x: 12, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 12, scale: 0.96 }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.28,
                delay: shouldReduceMotion ? 0 : 0.08,
                ease: "easeOut",
              }}
            >
              <button
                type="button"
                className="flex flex-1 flex-col items-center justify-center rounded-xl border bg-muted/30 text-center transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                onClick={() => setView("camera")}
                aria-label="Take an optional context photo"
              >
                <CameraIcon
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="mt-2 text-xs font-medium">Camera</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  Optional
                </span>
              </button>
              <button
                type="button"
                className="flex flex-1 flex-col items-center justify-center rounded-xl border bg-muted/30 text-center transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                onClick={() => contextInputRef.current?.click()}
                aria-label="Upload optional context files"
              >
                <PaperclipIcon
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="mt-2 text-xs font-medium">Files</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  Optional
                </span>
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={GEMINI_AUDIO_UPLOAD_ACCEPT}
        onChange={selectAudio}
        tabIndex={-1}
      />
      <input
        ref={contextInputRef}
        className="sr-only"
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.gif,.heic,.heif,.webp,.pdf,.txt,.md,.csv,.doc,.docx,.rtf,.xls,.xlsx,.ppt,.pptx"
        multiple
        onChange={selectContextFiles}
        tabIndex={-1}
      />

      {contextFiles.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <PaperclipIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="truncate text-xs">
              {contextFiles.length} context{" "}
              {contextFiles.length === 1 ? "file" : "files"} added
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            onClick={onClearContextFiles}
          >
            Remove
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {file ? (
          <motion.div
            key="continue-upload"
            className="mt-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.24,
              ease: "easeOut",
            }}
          >
            <FamilyDrawerButton onClick={() => setView("preview")}>
              Continue
              <ArrowRightIcon aria-hidden="true" />
            </FamilyDrawerButton>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {fileError ? (
          <motion.p
            key="upload-error"
            className="overflow-hidden text-center text-xs text-destructive"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            aria-live="polite"
          >
            {fileError}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function RecordingScreen({
  initialSessions,
  user,
}: {
  initialSessions: DocBotSessionSummary[]
  user: AuthenticatedUser
}) {
  const { profile, saveProfile } = useDocBotProfile()
  const profileUser = useMemo(
    () => ({ ...user, name: profile.username || user.name }),
    [profile.username, user]
  )
  const activeAvatar = getAvatarOption(profile.avatarId)
  const activeAvatarColors = getAvatarColors(
    profile.avatarId,
    profile.avatarColors
  )
  const SuccessDocBotAvatar = activeAvatar.SuccessAvatar
  const FailureDocBotAvatar = activeAvatar.FailureAvatar
  const avatarRef = useRef<HTMLDivElement>(null)
  const activeSessionIdRef = useRef<string | undefined>(undefined)
  const conversationRequestRef = useRef<AbortController | undefined>(undefined)
  const promptDictationRef = useRef<PromptDictationRecorder | undefined>(
    undefined
  )
  const promptDictationAbortRef = useRef<AbortController | undefined>(undefined)
  const promptDictationTimerRef = useRef<number | undefined>(undefined)
  const promptDictationSilenceTimerRef = useRef<number | undefined>(undefined)
  const promptDictationPendingStreamRef = useRef<MediaStream | undefined>(
    undefined
  )
  const promptDictationGenerationRef = useRef(0)
  const liveRecordingControllerRef = useRef<
    LiveRecordingController | undefined
  >(undefined)
  const liveRecordingGenerationRef = useRef(0)
  const chatAvatarExitPromiseRef = useRef<Promise<void> | undefined>(undefined)
  const chatAvatarExitTimerRef = useRef<number | undefined>(undefined)
  const pendingChatExitActionRef = useRef(false)
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false)
  const [avatarPickerSession, setAvatarPickerSession] = useState(0)
  const [avatarAnimationSeed, setAvatarAnimationSeed] = useState(0)
  const [sessions, setSessions] = useState(initialSessions)
  const [archivedSessions, setArchivedSessions] = useState<
    DocBotSessionSummary[]
  >([])
  const [archivedSessionsError, setArchivedSessionsError] = useState<string>()
  const [isArchivedSessionsLoading, setIsArchivedSessionsLoading] =
    useState(false)
  const [isShowingArchived, setIsShowingArchived] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string>()
  const [isPersistedSessionOpen, setIsPersistedSessionOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isRecordingStarting, setIsRecordingStarting] = useState(false)
  const [isRecordingStopping, setIsRecordingStopping] = useState(false)
  const [liveRecordingFile, setLiveRecordingFile] = useState<File>()
  const [liveRecordingId, setLiveRecordingId] = useState<string>()
  const [recordingError, setRecordingError] = useState<string>()
  const [isDecisionOpen, setIsDecisionOpen] = useState(false)
  const [isRecordingNoticeOpen, setIsRecordingNoticeOpen] = useState(false)
  const [processingState, setProcessingState] =
    useState<ProcessingState>("idle")
  const [processingSource, setProcessingSource] =
    useState<ProcessingSource>("recording")
  const [uploadedAudioId, setUploadedAudioId] = useState<string>()
  const [processingJobId, setProcessingJobId] = useState<string>()
  const [processingError, setProcessingError] = useState<string>()
  const [drawerMode, setDrawerMode] = useState<"recording" | "upload">(
    "recording"
  )
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
  const [hasStoppedRecording, setHasStoppedRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [savedDuration, setSavedDuration] = useState<number>()
  const [selectedFile, setSelectedFile] = useState<File>()
  const [contextFiles, setContextFiles] = useState<File[]>([])
  const [followExpression, setFollowExpression] = useState<FollowExpression>()
  const [chatPrompt, setChatPrompt] = useState("")
  const [promptDictationError, setPromptDictationError] = useState<string>()
  const [promptDictationState, setPromptDictationState] =
    useState<PromptDictationState>("idle")
  const [promptDictationActivity, setPromptDictationActivity] =
    useState<PromptDictationActivity>("waiting")
  const [chatAgentState, setChatAgentState] = useState<ChatAgentState>("idle")
  const [loadedDocumentRevisionNumber, setLoadedDocumentRevisionNumber] =
    useState<number>()
  const [conversationLoadError, setConversationLoadError] = useState<string>()
  const [isConversationLoading, setIsConversationLoading] = useState(false)
  const [chatTransitionPhase, setChatTransitionPhase] =
    useState<ChatTransitionPhase>("processing")
  const [hasChatAvatarEntered, setHasChatAvatarEntered] = useState(false)
  const [isChatAvatarExiting, setIsChatAvatarExiting] = useState(false)
  const skipRecordingNoticeRef = useRef(false)
  const shouldReduceMotion = useReducedMotion()
  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport<DocBotUIMessage>({
        api: "/api/chat",
        credentials: "same-origin",
        prepareSendMessagesRequest: ({ messages }) => {
          const sessionId = activeSessionIdRef.current
          const message = messages.at(-1)

          if (!sessionId || !message) {
            throw new Error("A DocBot session is required before chatting.")
          }

          return { body: { message, sessionId } }
        },
      }),
    []
  )
  const {
    addToolApprovalResponse,
    clearError: clearChatError,
    error: chatError,
    messages: chatMessages,
    sendMessage,
    setMessages: setChatMessages,
    status: chatStatus,
    stop: stopChatResponse,
  } = useChat<DocBotUIMessage>({
    id: "docbot-active-session",
    messages: [],
    throttle: 50,
    transport: chatTransport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: () => setChatAgentState("idle"),
    onFinish: ({ isAbort, isError, message }) => {
      if (
        isAbort ||
        isError ||
        message.role !== "assistant" ||
        !getChatMessageText(message).trim()
      ) {
        setChatAgentState("idle")
        return
      }

      setChatAgentState("success")
      void getDocBotSessions()
        .then(setSessions)
        .catch((error) =>
          console.error("Unable to refresh DocBot sessions.", error)
        )
    },
  })
  const isUploadFlowOpen = isDecisionOpen && drawerMode === "upload"
  const isProcessingFlow = processingState !== "idle"
  const isChatViewActive =
    isPersistedSessionOpen ||
    (processingState === "success" && chatTransitionPhase === "chat")
  const isSuccessPloppingOut =
    processingState === "success" && chatTransitionPhase === "plopping-out"
  const processingOutcome =
    processingState === "success" || processingState === "failure"
      ? processingState
      : undefined
  const latestAssistantMessage = chatMessages.reduce<
    DocBotUIMessage | undefined
  >(
    (latestMessage, message) =>
      message.role === "assistant" ? message : latestMessage,
    undefined
  )
  const latestAssistantMessageId = latestAssistantMessage?.id
  const activeReasoningMessage =
    chatAgentState === "processing" && chatMessages.at(-1)?.role === "assistant"
      ? chatMessages.at(-1)
      : undefined
  const hasActiveAssistantReasoning =
    activeReasoningMessage?.parts.some(
      (part) => part.type === "reasoning" && part.text.trim().length > 0
    ) === true
  const latestContextMetadata = chatMessages.reduce<
    DocBotUIMessage["metadata"] | undefined
  >(
    (latestMetadata, message) =>
      message.role === "assistant" && message.metadata?.context
        ? message.metadata
        : latestMetadata,
    undefined
  )
  const contextSnapshot = latestContextMetadata?.context
  const documentRevisionNumber = chatMessages.reduce<number | undefined>(
    (latestRevision, message) => {
      const messageRevision = message.parts.reduce<number | undefined>(
        (latestPartRevision, part) => {
          if (
            part.type !== "tool-editClinicalDocument" ||
            part.state !== "output-available"
          ) {
            return latestPartRevision
          }

          return Math.max(latestPartRevision ?? 0, part.output.revisionNumber)
        },
        undefined
      )

      if (messageRevision === undefined) return latestRevision
      return Math.max(latestRevision ?? 0, messageRevision)
    },
    loadedDocumentRevisionNumber
  )
  const isChatResponding =
    chatStatus === "submitted" || chatStatus === "streaming"
  const isChatUserTyping =
    chatPrompt.trim().length > 0 || promptDictationState !== "idle"
  const isChatListening = promptDictationState === "recording"
  const chatAvatarLayoutId = activeSessionId
    ? `docbot-chat-avatar-${activeSessionId}`
    : "docbot-chat-avatar-pending"
  const showAvatarEdit =
    !isAvatarPickerOpen &&
    !isDecisionOpen &&
    !isRecordingNoticeOpen &&
    !isPersistedSessionOpen &&
    processingState === "idle" &&
    !isRecording &&
    !isRecordingStarting &&
    !isRecordingStopping &&
    !hasStoppedRecording &&
    savedDuration === undefined

  const plopOutChatAvatar = useCallback(() => {
    if (!isChatViewActive) return Promise.resolve()
    if (chatAvatarExitPromiseRef.current) {
      return chatAvatarExitPromiseRef.current
    }

    setIsChatAvatarExiting(true)

    const exitPromise = new Promise<void>((resolve) => {
      chatAvatarExitTimerRef.current = window.setTimeout(
        () => {
          chatAvatarExitTimerRef.current = undefined
          chatAvatarExitPromiseRef.current = undefined
          resolve()
        },
        shouldReduceMotion ? 0 : CHAT_AVATAR_PLOP_OUT_DURATION
      )
    })

    chatAvatarExitPromiseRef.current = exitPromise
    return exitPromise
  }, [isChatViewActive, shouldReduceMotion])

  const runAfterChatAvatarExit = useCallback(
    (action: () => void) => {
      if (pendingChatExitActionRef.current) return

      pendingChatExitActionRef.current = true
      void plopOutChatAvatar().then(() => {
        try {
          action()
        } finally {
          pendingChatExitActionRef.current = false
        }
      })
    },
    [plopOutChatAvatar]
  )

  const refreshPersistedSessions = useCallback(
    async (processingJobId?: string) => {
      const nextSessions = await getDocBotSessions()
      setSessions(nextSessions)

      if (processingJobId) {
        const completedSession = nextSessions.find(
          (session) => session.processingJobId === processingJobId
        )
        if (completedSession) {
          activeSessionIdRef.current = completedSession.id
          setActiveSessionId(completedSession.id)
        }

        return completedSession
      }

      return undefined
    },
    []
  )

  const applyUploadedAudioJob = useCallback(
    (job: AudioProcessingJob) => {
      if (job.status === "completed") {
        const summary = job.outputText?.trim()

        if (!summary) {
          setProcessingError(
            "Gemini finished without returning a Spanish summary."
          )
          setProcessingJobId(undefined)
          setProcessingState("failure")
          return true
        }

        clearChatError()
        setConversationLoadError(undefined)
        setIsConversationLoading(false)
        setChatAgentState("idle")
        setLoadedDocumentRevisionNumber(1)
        setIsChatAvatarExiting(false)
        setChatMessages([
          {
            id: `source-${job.jobId}`,
            role: "assistant",
            metadata: { source: "audio-summary" },
            parts: [{ type: "text", text: summary }],
          },
        ])
        setIsPersistedSessionOpen(false)
        setProcessingError(undefined)
        setProcessingJobId(undefined)
        setProcessingState("success")
        void refreshPersistedSessions(job.jobId).catch((error) => {
          console.error("Unable to refresh DocBot sessions.", error)
        })
        return true
      }

      if (isAudioProcessingFailure(job.status)) {
        setProcessingError(
          job.errorMessage || "Gemini could not summarize this audio."
        )
        setProcessingJobId(undefined)
        setProcessingState("failure")
        return true
      }

      return false
    },
    [clearChatError, refreshPersistedSessions, setChatMessages]
  )

  useEffect(() => {
    if (!isRecording || isPaused) return

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isPaused, isRecording])

  useEffect(() => {
    const generation = liveRecordingGenerationRef.current
    let disposed = false

    void recoverLatestLiveRecording(user.id)
      .then((recording) => {
        if (
          disposed ||
          !recording ||
          liveRecordingGenerationRef.current !== generation
        ) {
          return
        }

        setLiveRecordingId(recording.recordingId)
        setLiveRecordingFile(recording.file)
        setElapsedSeconds(Math.max(1, Math.round(recording.durationMs / 1000)))
        setSavedDuration(undefined)
        setHasStoppedRecording(true)
        setRecordingError(undefined)
      })
      .catch((error) => {
        if (disposed) return
        setRecordingError(
          error instanceof Error
            ? error.message
            : "A saved recording could not be recovered."
        )
      })

    return () => {
      disposed = true
      liveRecordingControllerRef.current?.abandon()
      liveRecordingControllerRef.current = undefined
    }
  }, [user.id])

  useEffect(() => {
    if (processingState !== "processing" || !processingJobId) {
      return
    }

    const controller = new AbortController()
    const jobId = processingJobId
    let pollTimer: number | undefined
    let consecutiveRequestErrors = 0

    async function pollInteraction() {
      try {
        const job = await getUploadedAudioProcessingJob(
          jobId,
          controller.signal
        )
        if (controller.signal.aborted) return

        consecutiveRequestErrors = 0
        if (applyUploadedAudioJob(job)) return

        pollTimer = window.setTimeout(pollInteraction, job.retryAfterMs ?? 3000)
      } catch (error) {
        if (controller.signal.aborted) return

        consecutiveRequestErrors += 1
        if (consecutiveRequestErrors >= 3) {
          setProcessingError(
            error instanceof Error
              ? error.message
              : "The processing status could not be checked."
          )
          setProcessingJobId(undefined)
          setProcessingState("failure")
          return
        }

        pollTimer = window.setTimeout(pollInteraction, 3000)
      }
    }

    pollTimer = window.setTimeout(pollInteraction, 3000)

    return () => {
      controller.abort()
      if (pollTimer !== undefined) window.clearTimeout(pollTimer)
    }
  }, [applyUploadedAudioJob, processingJobId, processingState])

  useEffect(() => {
    if (processingState !== "success") {
      const resetTimer = window.setTimeout(() => {
        setChatTransitionPhase("processing")
        setHasChatAvatarEntered(false)
      }, 0)

      return () => window.clearTimeout(resetTimer)
    }

    const successHold = shouldReduceMotion ? 900 : 1400
    const plopDuration = shouldReduceMotion ? 0 : 280
    const plopTimer = window.setTimeout(() => {
      setChatTransitionPhase("plopping-out")
    }, successHold)
    const chatTimer = window.setTimeout(() => {
      setChatTransitionPhase("chat")
    }, successHold + plopDuration)

    return () => {
      window.clearTimeout(plopTimer)
      window.clearTimeout(chatTimer)
    }
  }, [processingState, shouldReduceMotion])

  useEffect(() => {
    if (chatAgentState !== "success") return

    const happyTimer = window.setTimeout(() => {
      setChatAgentState("happy")
    }, CHAT_SUCCESS_FLASH_DURATION)

    return () => window.clearTimeout(happyTimer)
  }, [chatAgentState])

  useEffect(() => {
    if (chatAgentState !== "happy") return

    const idleTimer = window.setTimeout(() => {
      setChatAgentState("idle")
    }, CHAT_INACTIVITY_DELAY - CHAT_SUCCESS_FLASH_DURATION)

    return () => window.clearTimeout(idleTimer)
  }, [chatAgentState])

  useEffect(() => {
    return () => {
      promptDictationGenerationRef.current += 1
      promptDictationAbortRef.current?.abort()
      if (promptDictationTimerRef.current !== undefined) {
        window.clearTimeout(promptDictationTimerRef.current)
      }
      if (promptDictationSilenceTimerRef.current !== undefined) {
        window.clearTimeout(promptDictationSilenceTimerRef.current)
      }
      promptDictationPendingStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop())
      if (promptDictationRef.current) {
        cancelPromptDictationRecorder(promptDictationRef.current)
      }
    }
  }, [])

  function clearPromptDictationSilenceTimer() {
    if (promptDictationSilenceTimerRef.current === undefined) return

    window.clearTimeout(promptDictationSilenceTimerRef.current)
    promptDictationSilenceTimerRef.current = undefined
  }

  function schedulePromptDictationSilenceTimer(generation: number) {
    clearPromptDictationSilenceTimer()
    promptDictationSilenceTimerRef.current = window.setTimeout(() => {
      promptDictationSilenceTimerRef.current = undefined
      if (promptDictationGenerationRef.current !== generation) return
      void finishPromptDictation()
    }, PROMPT_DICTATION_SILENCE_TIMER_DURATION)
  }

  function cancelPromptDictation() {
    promptDictationGenerationRef.current += 1
    promptDictationAbortRef.current?.abort()
    promptDictationAbortRef.current = undefined

    if (promptDictationTimerRef.current !== undefined) {
      window.clearTimeout(promptDictationTimerRef.current)
      promptDictationTimerRef.current = undefined
    }
    clearPromptDictationSilenceTimer()
    promptDictationPendingStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop())
    promptDictationPendingStreamRef.current = undefined

    if (promptDictationRef.current) {
      cancelPromptDictationRecorder(promptDictationRef.current)
      promptDictationRef.current = undefined
    }

    setPromptDictationState("idle")
    setPromptDictationActivity("waiting")
    setPromptDictationError(undefined)
  }

  async function startPromptDictation() {
    if (
      promptDictationState !== "idle" ||
      isChatResponding ||
      isConversationLoading ||
      !activeSessionId
    ) {
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setPromptDictationError(
        window.isSecureContext
          ? "This browser does not support microphone recording."
          : "Microphone access requires HTTPS or localhost."
      )
      return
    }

    const generation = promptDictationGenerationRef.current + 1
    promptDictationGenerationRef.current = generation
    setPromptDictationError(undefined)
    setPromptDictationState("requesting")
    setPromptDictationActivity("waiting")

    let stream: MediaStream | undefined

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      })
      promptDictationPendingStreamRef.current = stream

      if (promptDictationGenerationRef.current !== generation) {
        promptDictationPendingStreamRef.current = undefined
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const dictation = await createPromptDictationRecorder(stream, {
        onSpeechEnd: () => {
          if (
            promptDictationGenerationRef.current !== generation ||
            !promptDictationRef.current
          ) {
            return
          }

          setPromptDictationActivity("pausing")
          schedulePromptDictationSilenceTimer(generation)
        },
        onSpeechRealStart: () => {
          if (
            promptDictationGenerationRef.current !== generation ||
            !promptDictationRef.current
          ) {
            return
          }
          setPromptDictationActivity("speaking")
        },
        onSpeechStart: () => {
          if (
            promptDictationGenerationRef.current !== generation ||
            !promptDictationRef.current
          ) {
            return
          }

          clearPromptDictationSilenceTimer()
          setPromptDictationActivity("speaking")
        },
        onVADMisfire: () => {
          const activeDictation = promptDictationRef.current
          if (
            promptDictationGenerationRef.current !== generation ||
            !activeDictation
          ) {
            return
          }

          if (activeDictation.segments.length > 0) {
            setPromptDictationActivity("pausing")
            schedulePromptDictationSilenceTimer(generation)
          } else {
            setPromptDictationActivity("waiting")
          }
        },
      })
      if (promptDictationPendingStreamRef.current === stream) {
        promptDictationPendingStreamRef.current = undefined
      }
      stream = undefined

      if (promptDictationGenerationRef.current !== generation) {
        cancelPromptDictationRecorder(dictation)
        return
      }

      promptDictationRef.current = dictation
      setPromptDictationState("recording")
      promptDictationTimerRef.current = window.setTimeout(() => {
        void finishPromptDictation()
      }, PROMPT_DICTATION_MAX_DURATION)
    } catch (error) {
      if (promptDictationPendingStreamRef.current === stream) {
        promptDictationPendingStreamRef.current = undefined
      }
      stream?.getTracks().forEach((track) => track.stop())
      if (promptDictationGenerationRef.current !== generation) return

      setPromptDictationError(getMicrophoneErrorMessage(error))
      setPromptDictationState("idle")
      setPromptDictationActivity("waiting")
    }
  }

  async function finishPromptDictation() {
    const dictation = promptDictationRef.current
    if (!dictation) return

    promptDictationRef.current = undefined
    if (promptDictationTimerRef.current !== undefined) {
      window.clearTimeout(promptDictationTimerRef.current)
      promptDictationTimerRef.current = undefined
    }
    clearPromptDictationSilenceTimer()

    const generation = promptDictationGenerationRef.current
    const controller = new AbortController()
    promptDictationAbortRef.current = controller
    setPromptDictationError(undefined)
    setPromptDictationState("transcribing")

    try {
      const audio = await stopPromptDictationRecorder(dictation)
      if (
        controller.signal.aborted ||
        promptDictationGenerationRef.current !== generation
      ) {
        return
      }

      const transcript = await transcribePromptDictation(
        audio,
        controller.signal
      )
      if (
        controller.signal.aborted ||
        promptDictationGenerationRef.current !== generation
      ) {
        return
      }

      setChatPrompt((current) => appendPromptTranscript(current, transcript))
    } catch (error) {
      if (!controller.signal.aborted) {
        setPromptDictationError(getMicrophoneErrorMessage(error))
      }
    } finally {
      if (promptDictationAbortRef.current === controller) {
        promptDictationAbortRef.current = undefined
      }
      if (promptDictationGenerationRef.current === generation) {
        setPromptDictationState("idle")
        setPromptDictationActivity("waiting")
      }
    }
  }

  function startRecording() {
    if (isRecordingStarting || isRecordingStopping) return

    if (isChatViewActive) {
      runAfterChatAvatarExit(() => void startRecordingImmediately())
      return
    }

    void startRecordingImmediately()
  }

  async function startRecordingImmediately() {
    const generation = liveRecordingGenerationRef.current + 1
    liveRecordingGenerationRef.current = generation
    cancelPromptDictation()
    void stopChatResponse()
    conversationRequestRef.current?.abort()
    const previousController = liveRecordingControllerRef.current
    const previousRecordingId = liveRecordingId
    liveRecordingControllerRef.current = undefined
    setIsAvatarPickerOpen(false)
    setIsRecordingNoticeOpen(false)
    activeSessionIdRef.current = undefined
    setActiveSessionId(undefined)
    setIsPersistedSessionOpen(false)
    setChatMessages([])
    setChatPrompt("")
    clearChatError()
    setConversationLoadError(undefined)
    setIsConversationLoading(false)
    setElapsedSeconds(0)
    setSavedDuration(undefined)
    setHasStoppedRecording(false)
    setProcessingState("idle")
    setProcessingSource("recording")
    setProcessingJobId(undefined)
    setProcessingError(undefined)
    setRecordingError(undefined)
    setIsConfirmingDiscard(false)
    setIsPaused(false)
    setIsRecording(false)
    setIsRecordingStarting(true)
    setLiveRecordingFile(undefined)
    setLiveRecordingId(undefined)

    try {
      if (previousController) await previousController.cancel()
      else if (previousRecordingId) {
        await discardLiveRecording(previousRecordingId)
      }

      const controller = await startLiveRecording({
        userId: user.id,
        onStorageError: (error) => setRecordingError(error.message),
      })

      if (liveRecordingGenerationRef.current !== generation) {
        await controller.cancel()
        return
      }

      liveRecordingControllerRef.current = controller
      setLiveRecordingId(controller.id)
      setIsRecording(true)
    } catch (error) {
      if (liveRecordingGenerationRef.current !== generation) return
      setRecordingError(getMicrophoneErrorMessage(error))
      setIsRecording(false)
    } finally {
      if (liveRecordingGenerationRef.current === generation) {
        setIsRecordingStarting(false)
      }
    }
  }

  async function stopRecording() {
    const controller = liveRecordingControllerRef.current
    if (!controller || isRecordingStopping) return

    setIsRecordingStopping(true)
    setIsRecording(false)
    setIsPaused(false)
    setRecordingError(undefined)

    try {
      const recording = await controller.stop()
      if (liveRecordingControllerRef.current !== controller) return

      liveRecordingControllerRef.current = undefined
      setLiveRecordingId(recording.recordingId)
      setLiveRecordingFile(recording.file)
      setElapsedSeconds(Math.max(1, Math.round(recording.durationMs / 1000)))
      setHasStoppedRecording(true)
      setProcessingState("idle")
      setIsConfirmingDiscard(false)
      setDrawerMode("recording")
      setIsDecisionOpen(true)
    } catch (error) {
      liveRecordingControllerRef.current = undefined
      await controller.cancel().catch(() => undefined)
      setLiveRecordingId(undefined)
      setLiveRecordingFile(undefined)
      setHasStoppedRecording(false)
      setRecordingError(
        error instanceof Error
          ? error.message
          : "The recording could not be completed."
      )
    } finally {
      setIsRecordingStopping(false)
    }
  }

  function discardRecording() {
    liveRecordingGenerationRef.current += 1
    const controller = liveRecordingControllerRef.current
    const recordingId = liveRecordingId
    liveRecordingControllerRef.current = undefined
    if (controller) void controller.cancel().catch(() => undefined)
    else if (recordingId) {
      void discardLiveRecording(recordingId).catch(() => undefined)
    }

    setIsDecisionOpen(false)
    setHasStoppedRecording(false)
    setProcessingState("idle")
    setProcessingJobId(undefined)
    setProcessingError(undefined)
    setIsConfirmingDiscard(false)
    setSavedDuration(undefined)
    setElapsedSeconds(0)
    setIsPaused(false)
    setIsRecording(false)
    setIsRecordingStarting(false)
    setIsRecordingStopping(false)
    setLiveRecordingFile(undefined)
    setLiveRecordingId(undefined)
    setRecordingError(undefined)
  }

  function continueToProcessing() {
    setHasStoppedRecording(false)
    setIsConfirmingDiscard(false)
    setIsPaused(false)
    setIsRecording(false)
    setIsDecisionOpen(false)
    setProcessingState("processing")
  }

  async function saveAndContinue(
    onProgress: (progress: number) => void,
    onStage: (stage: UploadStage) => void
  ) {
    if (!liveRecordingFile) {
      throw new Error("The completed recording could not be found.")
    }

    const result = await uploadDocBotFiles({
      audioFile: liveRecordingFile,
      contextFiles: [],
      onProgress,
      onStage,
      source: "recording",
    })
    if (result.status === "duplicate") return result

    const recordingId = liveRecordingId
    setUploadedAudioId(result.uploadId)
    setSavedDuration(elapsedSeconds)
    setLiveRecordingFile(undefined)
    setLiveRecordingId(undefined)
    if (recordingId) {
      await discardLiveRecording(recordingId).catch(() => undefined)
    }
    await processUploadedAudio(result.uploadId, { source: "recording" })
    return result
  }

  async function processUploadedAudio(
    uploadId = uploadedAudioId,
    {
      force = false,
      source = "upload",
    }: { force?: boolean; source?: ProcessingSource } = {}
  ) {
    cancelPromptDictation()
    setSavedDuration(undefined)
    setProcessingSource(source)
    setProcessingJobId(undefined)
    setProcessingError(undefined)
    void stopChatResponse()
    conversationRequestRef.current?.abort()
    activeSessionIdRef.current = undefined
    setActiveSessionId(undefined)
    setChatMessages([])
    setChatPrompt("")
    clearChatError()
    setConversationLoadError(undefined)
    setIsConversationLoading(false)
    setChatAgentState("idle")
    continueToProcessing()

    if (!uploadId) {
      setProcessingError("The uploaded audio could not be identified.")
      setProcessingState("failure")
      return
    }

    try {
      const job = await startUploadedAudioProcessing(uploadId, { force })
      if (!applyUploadedAudioJob(job)) setProcessingJobId(job.jobId)
    } catch (error) {
      setProcessingError(
        error instanceof Error
          ? error.message
          : "The audio could not be submitted to Gemini."
      )
      setProcessingState("failure")
    }
  }

  function changeDecisionOpen(open: boolean) {
    setIsDecisionOpen(open)
    if (!open) setIsConfirmingDiscard(false)
  }

  async function togglePaused() {
    const controller = liveRecordingControllerRef.current
    if (!isRecording || !controller) return

    try {
      if (isPaused) await controller.resume()
      else await controller.pause()
      setIsPaused((current) => !current)
      setRecordingError(undefined)
    } catch (error) {
      setRecordingError(
        error instanceof Error
          ? error.message
          : "The recording controls could not be updated."
      )
    }
  }

  function requestLiveRecording() {
    setIsAvatarPickerOpen(false)
    let shouldSkipNotice = skipRecordingNoticeRef.current

    try {
      shouldSkipNotice ||=
        window.localStorage.getItem(RECORDING_NOTICE_STORAGE_KEY) === "true"
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }

    if (shouldSkipNotice) {
      startRecording()
      return
    }

    setIsRecordingNoticeOpen(true)
  }

  function rememberNoticeAndRecord() {
    skipRecordingNoticeRef.current = true

    try {
      window.localStorage.setItem(RECORDING_NOTICE_STORAGE_KEY, "true")
    } catch {
      // Keep the preference for this session when storage is unavailable.
    }

    startRecording()
  }

  function openUploadFlow() {
    if (isChatViewActive) {
      runAfterChatAvatarExit(openUploadFlowImmediately)
      return
    }

    openUploadFlowImmediately()
  }

  function openUploadFlowImmediately() {
    cancelPromptDictation()
    void stopChatResponse()
    conversationRequestRef.current?.abort()
    setIsAvatarPickerOpen(false)
    setIsRecordingNoticeOpen(false)
    activeSessionIdRef.current = undefined
    setActiveSessionId(undefined)
    setIsPersistedSessionOpen(false)
    setChatMessages([])
    setChatPrompt("")
    clearChatError()
    setConversationLoadError(undefined)
    setIsConversationLoading(false)
    setSelectedFile(undefined)
    setContextFiles([])
    setUploadedAudioId(undefined)
    setProcessingState("idle")
    setProcessingSource("upload")
    setProcessingJobId(undefined)
    setProcessingError(undefined)
    setDrawerMode("upload")
    setIsConfirmingDiscard(false)
    setIsDecisionOpen(true)
  }

  function addContextFiles(files: File[]) {
    setContextFiles((current) => {
      const existing = new Set(
        current.map((file) => `${file.name}-${file.size}-${file.lastModified}`)
      )
      const additions = files.filter(
        (file) =>
          !existing.has(`${file.name}-${file.size}-${file.lastModified}`)
      )

      return [...current, ...additions].slice(0, MAX_CONTEXT_FILES)
    })
  }

  async function uploadSelectedFiles(
    audioFile: File,
    attachments: File[],
    onProgress: (progress: number) => void,
    onStage: (stage: UploadStage) => void
  ) {
    const result = await uploadDocBotFiles({
      audioFile,
      contextFiles: attachments,
      onProgress,
      onStage,
    })

    if (result.status === "uploaded") setUploadedAudioId(result.uploadId)
    return result
  }

  function continueToDuplicateSession(session: DocBotSessionSummary) {
    setSessions((current) =>
      current.some((candidate) => candidate.id === session.id)
        ? current
        : [session, ...current]
    )
    selectPersistedSession(session.id)
  }

  function processDuplicateAudio(uploadId: string) {
    setUploadedAudioId(uploadId)
    setSelectedFile(undefined)
    setContextFiles([])
    void processUploadedAudio(uploadId, { force: true })
  }

  function continueToDuplicateRecordingSession(session: DocBotSessionSummary) {
    discardRecording()
    continueToDuplicateSession(session)
  }

  function processDuplicateRecording(uploadId: string) {
    discardRecording()
    setUploadedAudioId(uploadId)
    void processUploadedAudio(uploadId, {
      force: true,
      source: "recording",
    })
  }

  function openRecordingReview() {
    setDrawerMode("recording")
    setIsConfirmingDiscard(false)
    setIsDecisionOpen(true)
  }

  function openAvatarPicker() {
    const randomValue = new Uint32Array(1)

    try {
      window.crypto.getRandomValues(randomValue)
    } catch {
      randomValue[0] = Date.now()
    }

    setAvatarAnimationSeed(randomValue[0])
    setAvatarPickerSession((current) => current + 1)
    setIsAvatarPickerOpen(true)
  }

  function followPointer(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5
    const horizontal = Math.abs(x)
    const vertical = Math.abs(y)

    let expression: FollowExpression = "neutral"

    if (Math.max(horizontal, vertical) > 0.12) {
      if (vertical > horizontal) {
        expression = y < 0 ? "upward-side-glance" : "downward-gaze"
      } else {
        expression = x < 0 ? "curious-left" : "far-right-glance"
      }
    }

    setFollowExpression(expression)

    if (avatarRef.current) {
      avatarRef.current.style.transform = `perspective(600px) rotateX(${-y * 5}deg) rotateY(${x * 5}deg) translate3d(${x * 5}px, ${y * 5}px, 0)`
    }
  }

  function stopFollowing() {
    setFollowExpression(undefined)

    if (avatarRef.current) {
      avatarRef.current.style.transform = ""
    }
  }

  function selectPersistedSession(sessionId: string) {
    if (
      isRecording ||
      isRecordingStarting ||
      isRecordingStopping ||
      hasStoppedRecording
    ) {
      if (hasStoppedRecording) openRecordingReview()
      return
    }

    if (isChatViewActive) {
      if (sessionId === activeSessionId) return

      runAfterChatAvatarExit(() => openPersistedSession(sessionId))
      return
    }

    openPersistedSession(sessionId)
  }

  function openPersistedSession(sessionId: string) {
    cancelPromptDictation()
    void stopChatResponse()
    conversationRequestRef.current?.abort()
    const controller = new AbortController()
    conversationRequestRef.current = controller
    activeSessionIdRef.current = sessionId
    setActiveSessionId(sessionId)
    setIsPersistedSessionOpen(true)
    setIsDecisionOpen(false)
    setIsRecordingNoticeOpen(false)
    setIsRecording(false)
    setIsPaused(false)
    setHasStoppedRecording(false)
    setSavedDuration(undefined)
    setProcessingState("idle")
    setProcessingJobId(undefined)
    setProcessingError(undefined)
    setLoadedDocumentRevisionNumber(undefined)
    setChatMessages([])
    setChatPrompt("")
    clearChatError()
    setConversationLoadError(undefined)
    setIsConversationLoading(true)
    setChatAgentState("idle")
    setHasChatAvatarEntered(false)
    setIsChatAvatarExiting(false)

    void getDocBotConversation(sessionId, controller.signal)
      .then(({ documentRevisionNumber, messages }) => {
        if (
          controller.signal.aborted ||
          activeSessionIdRef.current !== sessionId
        ) {
          return
        }

        setLoadedDocumentRevisionNumber(documentRevisionNumber)
        setChatMessages(messages)
      })
      .catch((error) => {
        if (controller.signal.aborted) return

        setConversationLoadError(
          error instanceof Error
            ? error.message
            : "The conversation could not be loaded."
        )
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          activeSessionIdRef.current === sessionId
        ) {
          setIsConversationLoading(false)
        }
      })
  }

  function submitChatPrompt(message: PromptInputMessage) {
    const content = message.text.trim()

    if (
      !content ||
      isChatResponding ||
      isConversationLoading ||
      promptDictationState !== "idle" ||
      !activeSessionIdRef.current
    ) {
      return
    }

    clearChatError()
    setConversationLoadError(undefined)
    setPromptDictationError(undefined)
    setChatAgentState("processing")
    setChatPrompt("")
    void sendMessage({ text: content }).catch(() => {
      setChatAgentState("idle")
    })
  }

  function leaveChatSessionView() {
    cancelPromptDictation()
    void stopChatResponse()
    conversationRequestRef.current?.abort()
    activeSessionIdRef.current = undefined
    setActiveSessionId(undefined)
    setIsPersistedSessionOpen(false)
    setChatMessages([])
    setChatPrompt("")
    clearChatError()
    setConversationLoadError(undefined)
    setIsConversationLoading(false)
    setChatAgentState("idle")
    setLoadedDocumentRevisionNumber(undefined)
    setProcessingState("idle")
    setChatTransitionPhase("processing")
    setHasChatAvatarEntered(false)
    setIsChatAvatarExiting(false)
  }

  function returnToMainViewImmediately() {
    leaveChatSessionView()
    setIsAvatarPickerOpen(false)
    setIsRecordingNoticeOpen(false)
    setIsDecisionOpen(false)
    setIsRecording(false)
    setIsPaused(false)
    setHasStoppedRecording(false)
    setIsConfirmingDiscard(false)
    setSavedDuration(undefined)
    setElapsedSeconds(0)
    setSelectedFile(undefined)
    setContextFiles([])
    setUploadedAudioId(undefined)
    setProcessingSource("recording")
    setProcessingJobId(undefined)
    setProcessingError(undefined)
    setDrawerMode("recording")
    setPromptDictationError(undefined)
    setIsShowingArchived(false)
  }

  function returnToMainView() {
    if (
      isRecording ||
      isRecordingStarting ||
      isRecordingStopping ||
      hasStoppedRecording
    ) {
      if (hasStoppedRecording) openRecordingReview()
      return
    }

    if (isChatViewActive) {
      runAfterChatAvatarExit(returnToMainViewImmediately)
      return
    }

    returnToMainViewImmediately()
  }

  async function renamePersistedSession(sessionId: string, title: string) {
    const updatedSession = await renameDocBotSessionRequest(sessionId, title)
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? updatedSession : session
      )
    )
    setArchivedSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? updatedSession : session
      )
    )
  }

  async function archivePersistedSession(sessionId: string) {
    const isActiveSession = activeSessionIdRef.current === sessionId
    const archivedSession = sessions.find((session) => session.id === sessionId)
    if (isActiveSession) await stopChatResponse()

    await archiveDocBotSessionRequest(sessionId)
    if (isActiveSession) {
      await plopOutChatAvatar()
      leaveChatSessionView()
    }
    setSessions((current) =>
      current.filter((session) => session.id !== sessionId)
    )
    if (archivedSession) {
      setArchivedSessions((current) => [
        archivedSession,
        ...current.filter((session) => session.id !== sessionId),
      ])
    }
  }

  async function restorePersistedSession(
    sessionId: string,
    { open = false }: { open?: boolean } = {}
  ) {
    const restoredSession = archivedSessions.find(
      (session) => session.id === sessionId
    )
    await unarchiveDocBotSessionRequest(sessionId)
    setArchivedSessions((current) =>
      current.filter((session) => session.id !== sessionId)
    )

    if (restoredSession) {
      setSessions((current) => [
        restoredSession,
        ...current.filter((session) => session.id !== sessionId),
      ])
    } else {
      void getDocBotSessions()
        .then(setSessions)
        .catch((error) =>
          console.error("Unable to refresh restored DocBot session.", error)
        )
    }

    if (open) {
      setIsShowingArchived(false)
      selectPersistedSession(sessionId)
    }
  }

  async function deletePersistedSession(sessionId: string) {
    const isActiveSession = activeSessionIdRef.current === sessionId
    if (isActiveSession) await stopChatResponse()

    await deleteDocBotSessionRequest(sessionId)
    if (isActiveSession) {
      await plopOutChatAvatar()
      leaveChatSessionView()
    }
    setSessions((current) =>
      current.filter((session) => session.id !== sessionId)
    )
    setArchivedSessions((current) =>
      current.filter((session) => session.id !== sessionId)
    )
  }

  function showArchivedSessions() {
    setIsShowingArchived(true)
    setArchivedSessionsError(undefined)
    setIsArchivedSessionsLoading(true)

    void getDocBotSessions({ archived: true })
      .then(setArchivedSessions)
      .catch((error) => {
        setArchivedSessionsError(
          error instanceof Error
            ? error.message
            : "Archived chats could not be loaded."
        )
      })
      .finally(() => setIsArchivedSessionsLoading(false))
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <ChatHistorySidebar
        archivedSessions={archivedSessions}
        archivedSessionsError={archivedSessionsError}
        isArchivedSessionsLoading={isArchivedSessionsLoading}
        isShowingArchived={isShowingArchived}
        user={profileUser}
        sessions={sessions}
        selectedSessionId={activeSessionId}
        onArchiveSession={archivePersistedSession}
        onBeforeLeave={plopOutChatAvatar}
        onDeleteSession={deletePersistedSession}
        onGoHome={returnToMainView}
        onRenameSession={renamePersistedSession}
        onRestoreSession={restorePersistedSession}
        onSelectSession={selectPersistedSession}
        onShowArchivedSessions={showArchivedSessions}
        onShowRecentSessions={() => setIsShowingArchived(false)}
      />
      <div className="min-w-0 flex-1">
        <FamilyDrawerRoot
          open={isDecisionOpen}
          onOpenChange={changeDecisionOpen}
        >
          <div
            className={cn(
              "relative flex min-h-svh flex-col overflow-hidden bg-background",
              isChatViewActive && "h-svh"
            )}
          >
            <header className="flex h-16 shrink-0 items-center gap-1 px-5 sm:px-8">
              <SidebarTrigger className="-ml-2 size-8 [&_svg]:size-5!" />
            </header>

            <motion.main
              layout
              className={cn(
                "mx-auto flex w-full flex-1 flex-col items-center",
                isChatViewActive
                  ? "min-h-0 max-w-4xl justify-start overflow-hidden px-2 pt-2 pb-2 sm:px-4 sm:pt-4 sm:pb-4"
                  : "max-w-sm justify-center px-6 pb-8 sm:max-w-md sm:pb-12"
              )}
              transition={{
                layout: {
                  duration: shouldReduceMotion ? 0 : 0.5,
                  ease: "easeInOut",
                },
              }}
            >
              <motion.section
                layout
                className={cn(
                  "flex w-full flex-col items-center",
                  isChatViewActive && "min-h-0 flex-1"
                )}
                aria-labelledby={
                  isChatViewActive ? undefined : "recording-title"
                }
              >
                <motion.div
                  layout
                  className={cn(
                    "relative z-10 flex shrink-0 items-center justify-center",
                    isChatViewActive ? "size-0" : "size-64 sm:size-72"
                  )}
                  transition={{
                    layout: {
                      duration: shouldReduceMotion ? 0 : 0.5,
                      ease: "easeInOut",
                    },
                  }}
                  onPointerMove={followPointer}
                  onPointerLeave={stopFollowing}
                >
                  {isRecording && (
                    <div
                      className="pointer-events-none absolute top-1/2 left-1/2 z-0 w-screen -translate-x-1/2 -translate-y-1/2 overflow-hidden opacity-20"
                      aria-hidden="true"
                    >
                      <LiveWaveform
                        active={!isPaused}
                        height="clamp(210px, 36vh, 345px)"
                        barGap={5}
                        barHeight={3}
                        barRadius={2}
                        barWidth={3}
                        fadeEdges={false}
                        historySize={320}
                        mode="scrolling"
                        sensitivity={2.25}
                        smoothingTimeConstant={0.72}
                        stream={liveRecordingControllerRef.current?.stream}
                        updateRate={60}
                      />
                    </div>
                  )}

                  <AnimatePresence initial={false}>
                    {showAvatarEdit ? (
                      <motion.div
                        key="avatar-edit"
                        className="absolute top-3 right-2 z-20 sm:top-4 sm:right-3"
                        initial={{ opacity: 0, scale: 0.82 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.82 }}
                        transition={{
                          duration: shouldReduceMotion ? 0 : 0.18,
                          ease: "easeOut",
                        }}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="rounded-full"
                          aria-label="Customize DocBot"
                          onClick={openAvatarPicker}
                        >
                          <PencilLineIcon aria-hidden="true" />
                        </Button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {!isChatViewActive ? (
                    <motion.div
                      className="relative flex items-center justify-center"
                      animate={
                        isSuccessPloppingOut && !shouldReduceMotion
                          ? {
                              opacity: [1, 1, 0.9, 0],
                              scale: [1, 1.1, 0.78, 0],
                            }
                          : { opacity: 1, scale: 1 }
                      }
                      transition={
                        isSuccessPloppingOut && !shouldReduceMotion
                          ? {
                              duration: 0.28,
                              ease: "easeInOut",
                              times: [0, 0.28, 0.68, 1],
                            }
                          : {
                              duration: shouldReduceMotion ? 0 : 0.2,
                              ease: "easeOut",
                            }
                      }
                    >
                      <div
                        className="pointer-events-none absolute z-0 size-56 rounded-full bg-foreground/20 blur-2xl sm:size-64"
                        aria-hidden="true"
                      />

                      <div
                        ref={avatarRef}
                        className="relative z-10 flex items-center justify-center transition-transform duration-200 ease-out motion-reduce:transform-none"
                      >
                        <motion.div
                          className="relative flex items-center justify-center"
                          animate={
                            processingOutcome && !shouldReduceMotion
                              ? { scale: [1, 1.055, 1] }
                              : { scale: 1 }
                          }
                          transition={
                            processingOutcome && !shouldReduceMotion
                              ? {
                                  duration: 1.8,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }
                              : { duration: 0.2 }
                          }
                        >
                          {processingOutcome ? (
                            <>
                              <CustomColorAvatar
                                colors={activeAvatarColors}
                                source={activeAvatar.definition}
                                expression={
                                  processingOutcome === "success"
                                    ? "joyful-wide"
                                    : "neutral"
                                }
                                size="min(60vw, 248px)"
                                ariaLabel={
                                  processingOutcome === "success"
                                    ? "DocBot avatar signaling successful processing"
                                    : "DocBot avatar signaling failed processing"
                                }
                              />
                              <motion.div
                                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                                aria-hidden="true"
                                animate={
                                  shouldReduceMotion
                                    ? { opacity: 1 }
                                    : { opacity: [0.15, 1, 0.15] }
                                }
                                transition={
                                  shouldReduceMotion
                                    ? { duration: 0 }
                                    : {
                                        duration: 1.8,
                                        repeat: Infinity,
                                        ease: "easeInOut",
                                      }
                                }
                              >
                                {processingOutcome === "success" ? (
                                  <SuccessDocBotAvatar
                                    expression="joyful-wide"
                                    size="min(60vw, 248px)"
                                    ariaLabel="Success color pulse"
                                  />
                                ) : (
                                  <FailureDocBotAvatar
                                    expression="neutral"
                                    size="min(60vw, 248px)"
                                    ariaLabel="Failure color pulse"
                                  />
                                )}
                              </motion.div>
                            </>
                          ) : (
                            <CustomColorAvatar
                              colors={activeAvatarColors}
                              source={activeAvatar.definition}
                              {...(isConfirmingDiscard && hasStoppedRecording
                                ? { animation: "angry-brows-shake" }
                                : isUploadFlowOpen
                                  ? { animation: "excited" }
                                  : processingState === "processing"
                                    ? { animation: "thinking" }
                                    : followExpression &&
                                        !isPaused &&
                                        !hasStoppedRecording
                                      ? { expression: followExpression }
                                      : {
                                          animation: isPaused
                                            ? "bored"
                                            : isRecording
                                              ? "listening"
                                              : hasStoppedRecording
                                                ? "curious"
                                                : "idle",
                                        })}
                              size="min(60vw, 248px)"
                              ariaLabel={
                                isConfirmingDiscard && hasStoppedRecording
                                  ? "DocBot avatar reacting to the discard confirmation"
                                  : isUploadFlowOpen
                                    ? "DocBot avatar excited while audio and context files are added"
                                    : processingState === "processing"
                                      ? "DocBot avatar thinking while the recording is processed"
                                      : isPaused
                                        ? "DocBot avatar waiting while recording is paused"
                                        : isRecording
                                          ? "DocBot avatar listening while audio is recorded"
                                          : hasStoppedRecording
                                            ? "DocBot avatar curiously reviewing the completed recording"
                                            : "DocBot avatar waiting to record"
                              }
                            />
                          )}
                        </motion.div>
                      </div>
                    </motion.div>
                  ) : null}
                </motion.div>

                <AnimatePresence initial={false} mode="wait">
                  {isChatViewActive ? (
                    <motion.div
                      key="success-chat"
                      layout
                      className="relative z-0 mt-0 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border bg-background px-1.5 pt-1.5 pb-1.5"
                      initial={{ opacity: 0, y: 18, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.99 }}
                      transition={{
                        duration: shouldReduceMotion ? 0 : 0.38,
                        delay: shouldReduceMotion ? 0 : 0.12,
                        ease: "easeOut",
                      }}
                      role="region"
                      aria-label="AI messages"
                    >
                      <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-border/55 px-0.5 pb-1">
                        {activeSessionId && documentRevisionNumber ? (
                          <div className="flex min-w-0 items-center gap-1">
                            <Button
                              nativeButton={false}
                              render={
                                <a
                                  href={`/api/sessions/${activeSessionId}/document`}
                                  download
                                />
                              }
                              size="xs"
                              variant="ghost"
                            >
                              <DownloadIcon data-icon="inline-start" />
                              Download DOCX
                            </Button>
                            <Badge variant="secondary">
                              v{documentRevisionNumber}
                            </Badge>
                          </div>
                        ) : (
                          <span />
                        )}
                        <Context
                          maxTokens={
                            contextSnapshot?.maxTokens ??
                            DOCBOT_CONTEXT_TOKEN_LIMIT
                          }
                          usage={latestContextMetadata?.usage}
                          usedTokens={contextSnapshot?.usedTokens ?? 0}
                        >
                          <ContextTrigger
                            aria-label="View chat context usage"
                            className="h-6 gap-1 rounded-md px-1.5 text-[10px]"
                            size="xs"
                          />
                          <ContextContent
                            align="end"
                            className="w-64"
                            side="bottom"
                            sideOffset={6}
                          >
                            <ContextContentHeader />
                            <ContextContentBody className="space-y-1.5">
                              <ContextInputUsage />
                              <ContextOutputUsage />
                              <ContextReasoningUsage />
                              <ContextCacheUsage />
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-muted-foreground">
                                  Recent messages
                                </span>
                                <span className="tabular-nums">
                                  {contextSnapshot?.exactMessageCount ?? 0}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-muted-foreground">
                                  Compressed messages
                                </span>
                                <span className="tabular-nums">
                                  {contextSnapshot?.compactedMessageCount ?? 0}
                                </span>
                              </div>
                            </ContextContentBody>
                          </ContextContent>
                        </Context>
                      </div>
                      <Conversation
                        className="min-h-0"
                        aria-label="Conversation messages"
                        aria-live="polite"
                      >
                        <ConversationContent className="gap-3 px-1 py-1.5">
                          {latestAssistantMessageId === undefined &&
                          chatAgentState !== "processing" &&
                          !isConversationLoading ? (
                            <ChatMessageAvatar
                              SuccessAvatar={SuccessDocBotAvatar}
                              agentState={chatAgentState}
                              avatarColors={activeAvatarColors}
                              avatarDefinition={activeAvatar.definition}
                              hasEntered={hasChatAvatarEntered}
                              isExiting={isChatAvatarExiting}
                              isListening={isChatListening}
                              isTyping={isChatUserTyping}
                              layoutId={chatAvatarLayoutId}
                              reduceMotion={shouldReduceMotion}
                              onEntered={() => setHasChatAvatarEntered(true)}
                            />
                          ) : null}
                          {chatMessages.map((message) => {
                            const content = getChatMessageText(message)
                            const reasoningText = message.parts
                              .flatMap((part) =>
                                part.type === "reasoning"
                                  ? [part.text.trim()]
                                  : []
                              )
                              .filter(Boolean)
                              .join("\n\n")
                            const hasDocumentTool = message.parts.some(
                              (part) =>
                                part.type === "tool-editClinicalDocument"
                            )
                            const isActiveReasoning =
                              message.role === "assistant" &&
                              message.id === activeReasoningMessage?.id

                            if (
                              !content &&
                              !reasoningText &&
                              !hasDocumentTool
                            ) {
                              return null
                            }

                            return (
                              <Message
                                key={message.id}
                                from={message.role}
                                className="max-w-[92%] gap-1"
                              >
                                {message.role === "user" ? (
                                  <span className="self-end text-[10px] text-muted-foreground">
                                    You
                                  </span>
                                ) : null}
                                {reasoningText ? (
                                  <div className="flex w-full min-w-0 items-start gap-2 py-1">
                                    {isActiveReasoning ? (
                                      <ChatMessageAvatar
                                        SuccessAvatar={SuccessDocBotAvatar}
                                        agentState="processing"
                                        avatarColors={activeAvatarColors}
                                        avatarDefinition={
                                          activeAvatar.definition
                                        }
                                        hasEntered={hasChatAvatarEntered}
                                        isExiting={isChatAvatarExiting}
                                        isListening={isChatListening}
                                        isTyping={isChatUserTyping}
                                        layoutId={chatAvatarLayoutId}
                                        reduceMotion={shouldReduceMotion}
                                        onEntered={() =>
                                          setHasChatAvatarEntered(true)
                                        }
                                      />
                                    ) : null}
                                    <Reasoning
                                      className="mb-0 min-w-0 flex-1"
                                      isStreaming={isActiveReasoning}
                                    >
                                      <ReasoningTrigger
                                        className="min-h-8 gap-1.5 text-sm"
                                        getThinkingMessage={
                                          getDocBotThinkingMessage
                                        }
                                      />
                                      <ReasoningContent className="mt-2 text-sm leading-relaxed">
                                        {reasoningText}
                                      </ReasoningContent>
                                    </Reasoning>
                                  </div>
                                ) : null}
                                {content ? (
                                  <MessageContent
                                    className={cn(
                                      "gap-1 text-sm leading-relaxed",
                                      message.role === "user" &&
                                        "rounded-md px-2.5 py-1"
                                    )}
                                  >
                                    <MessageResponse>{content}</MessageResponse>
                                  </MessageContent>
                                ) : null}
                                {message.parts.map((part) => {
                                  if (
                                    part.type !== "tool-editClinicalDocument"
                                  ) {
                                    return null
                                  }

                                  return (
                                    <DocumentEditTool
                                      key={part.toolCallId}
                                      state={part.state}
                                    >
                                      <ToolHeader
                                        className="p-2.5"
                                        state={part.state}
                                        type={part.type}
                                      />
                                      <ToolContent className="space-y-3 border-t p-2.5">
                                        {part.state === "approval-requested" &&
                                        !part.approval.isAutomatic ? (
                                          <div className="flex flex-col gap-2">
                                            <ClinicalDocumentChangePreview
                                              changes={part.input.replacements}
                                            />
                                            <div className="flex gap-1.5">
                                              <Button
                                                type="button"
                                                size="xs"
                                                onClick={() => {
                                                  setChatAgentState(
                                                    "processing"
                                                  )
                                                  void Promise.resolve(
                                                    addToolApprovalResponse({
                                                      id: part.approval.id,
                                                      approved: true,
                                                    })
                                                  ).catch(() =>
                                                    setChatAgentState("idle")
                                                  )
                                                }}
                                              >
                                                Apply changes
                                              </Button>
                                              <Button
                                                type="button"
                                                size="xs"
                                                variant="outline"
                                                onClick={() => {
                                                  setChatAgentState(
                                                    "processing"
                                                  )
                                                  void Promise.resolve(
                                                    addToolApprovalResponse({
                                                      id: part.approval.id,
                                                      approved: false,
                                                      reason:
                                                        "User cancelled the document edit.",
                                                    })
                                                  ).catch(() =>
                                                    setChatAgentState("idle")
                                                  )
                                                }}
                                              >
                                                Cancel
                                              </Button>
                                            </div>
                                          </div>
                                        ) : null}

                                        {part.state === "approval-responded" ? (
                                          <span className="text-muted-foreground">
                                            {part.approval.approved
                                              ? "Applying approved changes…"
                                              : "Change cancelled."}
                                          </span>
                                        ) : null}

                                        {part.state === "output-available" ? (
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-muted-foreground">
                                              {part.output.updated
                                                ? `Document updated · revision ${part.output.revisionNumber}`
                                                : "No matching text was found in the document."}
                                            </span>
                                            {part.output.updated ? (
                                              <Button
                                                nativeButton={false}
                                                render={
                                                  <a
                                                    href={
                                                      part.output.downloadPath
                                                    }
                                                    download
                                                  />
                                                }
                                                size="xs"
                                                variant="outline"
                                              >
                                                <DownloadIcon data-icon="inline-start" />
                                                Download DOCX
                                              </Button>
                                            ) : null}
                                          </div>
                                        ) : null}

                                        {part.state === "output-error" ? (
                                          <span className="text-destructive">
                                            The document could not be updated.
                                          </span>
                                        ) : null}

                                        {part.state === "output-denied" ? (
                                          <span className="text-muted-foreground">
                                            Change cancelled.
                                          </span>
                                        ) : null}
                                      </ToolContent>
                                    </DocumentEditTool>
                                  )
                                })}
                                {message.role === "assistant" &&
                                message.id === latestAssistantMessageId &&
                                !isConversationLoading &&
                                chatAgentState !== "processing" ? (
                                  <ChatMessageAvatar
                                    SuccessAvatar={SuccessDocBotAvatar}
                                    agentState={chatAgentState}
                                    avatarColors={activeAvatarColors}
                                    avatarDefinition={activeAvatar.definition}
                                    hasEntered={hasChatAvatarEntered}
                                    isExiting={isChatAvatarExiting}
                                    isListening={isChatListening}
                                    isTyping={isChatUserTyping}
                                    layoutId={chatAvatarLayoutId}
                                    reduceMotion={shouldReduceMotion}
                                    onEntered={() =>
                                      setHasChatAvatarEntered(true)
                                    }
                                  />
                                ) : null}
                              </Message>
                            )
                          })}
                          {(chatAgentState === "processing" &&
                            !hasActiveAssistantReasoning) ||
                          isConversationLoading ? (
                            <div
                              className="flex min-h-10 items-center gap-2 self-start px-0.5 py-1"
                              role="status"
                            >
                              {!isConversationLoading &&
                              chatAgentState === "processing" ? (
                                <ChatMessageAvatar
                                  SuccessAvatar={SuccessDocBotAvatar}
                                  agentState="processing"
                                  avatarColors={activeAvatarColors}
                                  avatarDefinition={activeAvatar.definition}
                                  hasEntered={hasChatAvatarEntered}
                                  isExiting={isChatAvatarExiting}
                                  isListening={isChatListening}
                                  isTyping={isChatUserTyping}
                                  layoutId={chatAvatarLayoutId}
                                  reduceMotion={shouldReduceMotion}
                                  onEntered={() =>
                                    setHasChatAvatarEntered(true)
                                  }
                                />
                              ) : null}
                              {isConversationLoading ? (
                                <ShimmeringText
                                  text="Loading conversation…"
                                  duration={0.9}
                                  repeatDelay={0.1}
                                  startOnView={false}
                                />
                              ) : (
                                <Reasoning
                                  className="mb-0 min-w-0 flex-1"
                                  isStreaming
                                >
                                  <ReasoningTrigger
                                    className="min-h-8 gap-1.5 text-sm"
                                    getThinkingMessage={
                                      getDocBotThinkingMessage
                                    }
                                  />
                                </Reasoning>
                              )}
                            </div>
                          ) : null}
                        </ConversationContent>
                        <ConversationScrollButton className="bottom-2" />
                      </Conversation>

                      {conversationLoadError ||
                      promptDictationError ||
                      chatError ? (
                        <p
                          id="chat-input-error"
                          className="px-2 py-1 text-xs text-destructive"
                          role="alert"
                        >
                          {conversationLoadError ||
                            promptDictationError ||
                            "DocBot could not complete the response. Please try again."}
                        </p>
                      ) : null}

                      <PromptInput className="mt-1" onSubmit={submitChatPrompt}>
                        <PromptInputBody className="flex w-full items-end pl-1">
                          <PromptInputButton
                            aria-label={
                              promptDictationState === "recording"
                                ? "Stop voice dictation"
                                : promptDictationState === "transcribing"
                                  ? "Transcribing voice dictation"
                                  : "Start voice dictation"
                            }
                            aria-pressed={promptDictationState === "recording"}
                            className={cn(
                              "relative mb-1.5 shrink-0",
                              promptDictationState === "recording" &&
                                "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
                            )}
                            disabled={
                              promptDictationState === "requesting" ||
                              promptDictationState === "transcribing" ||
                              (promptDictationState === "idle" &&
                                (isChatResponding ||
                                  isConversationLoading ||
                                  !activeSessionId))
                            }
                            onClick={() => {
                              if (promptDictationState === "recording") {
                                void finishPromptDictation()
                              } else {
                                void startPromptDictation()
                              }
                            }}
                            size="icon-xs"
                            tooltip={
                              promptDictationState === "recording"
                                ? promptDictationActivity === "pausing"
                                  ? `Stop now or wait ${PROMPT_DICTATION_SILENCE_DURATION / 1000} seconds`
                                  : "Stop dictation"
                                : promptDictationState === "requesting"
                                  ? "Starting microphone…"
                                  : promptDictationState === "transcribing"
                                    ? "Transcribing…"
                                    : "Dictate prompt"
                            }
                          >
                            <MicIcon
                              aria-hidden="true"
                              className={cn(
                                "size-4",
                                promptDictationState === "recording" &&
                                  promptDictationActivity === "speaking" &&
                                  "animate-pulse",
                                (promptDictationState === "requesting" ||
                                  promptDictationState === "transcribing") &&
                                  "animate-pulse text-muted-foreground"
                              )}
                            />
                            {promptDictationState === "recording" ? (
                              <span
                                aria-hidden="true"
                                className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-destructive"
                              />
                            ) : null}
                          </PromptInputButton>
                          <div className="relative min-w-0 flex-1 self-stretch">
                            <PromptInputTextarea
                              aria-label="Ask DocBot about this recording"
                              aria-describedby={
                                conversationLoadError ||
                                promptDictationError ||
                                chatError
                                  ? "chat-input-error"
                                  : undefined
                              }
                              className={cn(
                                "max-h-20 min-h-9 w-full py-2 text-sm",
                                promptDictationState !== "idle" &&
                                  "text-transparent caret-transparent placeholder:text-transparent"
                              )}
                              onChange={(event) => {
                                setChatPrompt(event.currentTarget.value)
                                if (promptDictationError) {
                                  setPromptDictationError(undefined)
                                }
                              }}
                              placeholder="Ask about this recording…"
                              readOnly={promptDictationState !== "idle"}
                              value={chatPrompt}
                            />

                            <AnimatePresence initial={false}>
                              {promptDictationState !== "idle" ? (
                                <motion.div
                                  key="prompt-dictation-waveform"
                                  animate={{ opacity: 1, scaleX: 1 }}
                                  aria-live="polite"
                                  className="pointer-events-none absolute inset-x-1.5 inset-y-0 flex items-center text-foreground/55"
                                  exit={{ opacity: 0, scaleX: 0.96 }}
                                  initial={{ opacity: 0, scaleX: 0.96 }}
                                  transition={{
                                    duration: shouldReduceMotion ? 0 : 0.18,
                                    ease: "easeOut",
                                  }}
                                >
                                  <LiveWaveform
                                    active={
                                      promptDictationState === "recording"
                                    }
                                    barGap={2}
                                    barHeight={2}
                                    barRadius={1}
                                    barWidth={2}
                                    fadeWidth={18}
                                    height="100%"
                                    processing={
                                      promptDictationState === "requesting" ||
                                      promptDictationState === "transcribing"
                                    }
                                    sensitivity={1.45}
                                    stream={promptDictationRef.current?.stream}
                                  />
                                  <span className="sr-only" role="status">
                                    {promptDictationState === "requesting"
                                      ? "Starting microphone"
                                      : promptDictationState === "transcribing"
                                        ? "Transcribing dictated audio"
                                        : promptDictationActivity === "speaking"
                                          ? "Listening to speech"
                                          : "Waiting for speech"}
                                  </span>
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </div>
                        </PromptInputBody>
                        <PromptInputFooter className="justify-between px-1.5 pb-1.5">
                          {promptDictationState === "recording" ? (
                            <span
                              className="flex min-w-0 items-center gap-1.5 pl-1 text-[10px] text-muted-foreground"
                              role="status"
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "size-1.5 shrink-0 rounded-full",
                                  promptDictationActivity === "speaking"
                                    ? "animate-pulse bg-destructive"
                                    : "bg-muted-foreground/45"
                                )}
                              />
                              {promptDictationActivity === "speaking"
                                ? "Listening…"
                                : promptDictationActivity === "pausing"
                                  ? "Pause to finish…"
                                  : "Waiting for speech…"}
                            </span>
                          ) : null}
                          <PromptInputSubmit
                            className="ml-auto"
                            disabled={
                              !chatPrompt.trim() ||
                              isChatResponding ||
                              isConversationLoading ||
                              promptDictationState !== "idle" ||
                              !activeSessionId
                            }
                            size="icon-xs"
                            status={chatStatus}
                          />
                        </PromptInputFooter>
                      </PromptInput>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="capture-content"
                      className="w-full"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{
                        duration: shouldReduceMotion ? 0 : 0.22,
                        ease: "easeOut",
                      }}
                    >
                      <div className="mt-7 flex flex-col items-center gap-2 text-center">
                        <h1
                          id="recording-title"
                          className="text-xl font-medium tracking-tight sm:text-2xl"
                          aria-live="polite"
                        >
                          {processingState === "processing" ? (
                            <ShimmeringText
                              text={
                                processingSource === "upload"
                                  ? "Processing audio…"
                                  : "Processing recording…"
                              }
                              duration={1.8}
                              repeatDelay={0.25}
                              startOnView={false}
                            />
                          ) : processingState === "success" ? (
                            "Processing complete"
                          ) : processingState === "failure" ? (
                            "Processing failed"
                          ) : isRecordingStarting ? (
                            "Starting microphone…"
                          ) : isRecordingStopping ? (
                            "Saving recording…"
                          ) : isPaused ? (
                            "Recording paused"
                          ) : isRecording ? (
                            "I’m listening"
                          ) : hasStoppedRecording ? (
                            "Recording complete"
                          ) : savedDuration !== undefined ? (
                            "Recording ready"
                          ) : (
                            "Ready when you are"
                          )}
                        </h1>
                        <div className="min-h-5">
                          <AnimatePresence initial={false}>
                            {isProcessingFlow ? (
                              <motion.p
                                key="processing-status"
                                className={cn(
                                  "max-w-sm text-sm text-muted-foreground",
                                  processingState === "failure" &&
                                    "text-destructive"
                                )}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{
                                  duration: shouldReduceMotion ? 0 : 0.2,
                                }}
                                role={
                                  processingState === "failure"
                                    ? "alert"
                                    : "status"
                                }
                              >
                                {processingState === "processing"
                                  ? processingSource === "upload"
                                    ? "Gemini is listening and preparing your Spanish notes."
                                    : "DocBot is preparing your recording."
                                  : processingState === "failure"
                                    ? processingError ||
                                      "The recording could not be processed."
                                    : "Your notes are ready."}
                              </motion.p>
                            ) : (
                              <motion.div
                                key="recording-status"
                                initial={{ opacity: 1, y: 0 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                transition={{ duration: 0.22, ease: "easeOut" }}
                              >
                                {recordingError ? (
                                  <p
                                    className="max-w-xs text-sm text-destructive"
                                    role="alert"
                                  >
                                    {recordingError}
                                  </p>
                                ) : isRecording ? (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <TimerRoot size="sm" loading={!isPaused}>
                                      <TimerIcon
                                        size="sm"
                                        loading={!isPaused}
                                      />
                                      <TimerDisplay
                                        size="sm"
                                        time={formatDuration(elapsedSeconds)}
                                        label="Recording duration"
                                      />
                                    </TimerRoot>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {isPaused
                                        ? "Paused"
                                        : "Recording in progress"}
                                    </span>
                                  </div>
                                ) : isRecordingStarting ||
                                  isRecordingStopping ? (
                                  <p className="max-w-xs text-sm text-muted-foreground">
                                    {isRecordingStarting
                                      ? "Requesting microphone access and preparing local storage."
                                      : "Finalizing the last audio chunk for review."}
                                  </p>
                                ) : (
                                  <p className="max-w-xs text-sm text-muted-foreground">
                                    {hasStoppedRecording
                                      ? "Review it to save or start over."
                                      : savedDuration !== undefined
                                        ? `${formatDuration(savedDuration)} captured and ready to continue.`
                                        : "Upload an audio file, or record your conversation live."}
                                  </p>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      <div className="mt-8 min-h-44 w-full">
                        <AnimatePresence initial={false}>
                          {!isProcessingFlow ? (
                            <motion.div
                              key="recording-actions"
                              className="flex w-full flex-col gap-4"
                              initial={{ opacity: 1, y: 0 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 12 }}
                              transition={{ duration: 0.26, ease: "easeOut" }}
                            >
                              {isRecordingStarting ? (
                                <Button
                                  className="h-11 w-full"
                                  disabled
                                  size="lg"
                                >
                                  <MicIcon
                                    data-icon="inline-start"
                                    aria-hidden="true"
                                  />
                                  Starting…
                                </Button>
                              ) : isRecording || isRecordingStopping ? (
                                <div className="grid grid-cols-2 gap-3">
                                  <Button
                                    className="h-11 w-full"
                                    disabled={isRecordingStopping}
                                    variant="outline"
                                    size="lg"
                                    onClick={() => void togglePaused()}
                                  >
                                    {isPaused ? (
                                      <PlayIcon
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <PauseIcon
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                      />
                                    )}
                                    {isPaused ? "Resume" : "Pause"}
                                  </Button>
                                  <Button
                                    className="h-11 w-full"
                                    disabled={isRecordingStopping}
                                    size="lg"
                                    onClick={() => void stopRecording()}
                                  >
                                    <SquareIcon
                                      data-icon="inline-start"
                                      aria-hidden="true"
                                    />
                                    {isRecordingStopping ? "Saving…" : "Stop"}
                                  </Button>
                                </div>
                              ) : hasStoppedRecording ? (
                                <Button
                                  className="h-11 w-full"
                                  size="lg"
                                  onClick={openRecordingReview}
                                >
                                  <AudioLinesIcon
                                    data-icon="inline-start"
                                    aria-hidden="true"
                                  />
                                  Review recording
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    className="h-11 w-full"
                                    size="lg"
                                    onClick={openUploadFlow}
                                  >
                                    <UploadIcon
                                      data-icon="inline-start"
                                      aria-hidden="true"
                                    />
                                    Upload audio
                                  </Button>

                                  <div
                                    className="flex items-center gap-3"
                                    aria-hidden="true"
                                  >
                                    <Separator className="flex-1" />
                                    <span className="text-xs text-muted-foreground">
                                      or
                                    </span>
                                    <Separator className="flex-1" />
                                  </div>

                                  <PopoverForm
                                    disabled={isRecordingStarting}
                                    open={isRecordingNoticeOpen}
                                    setOpen={setIsRecordingNoticeOpen}
                                    title="Before recording"
                                    triggerLabel={
                                      isRecordingStarting
                                        ? "Starting…"
                                        : savedDuration !== undefined
                                          ? "Record another"
                                          : "Record live"
                                    }
                                    height={192}
                                    showCloseButton
                                    triggerIcon={
                                      <MicIcon
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                      />
                                    }
                                    onTrigger={requestLiveRecording}
                                    openChild={
                                      <div className="flex h-full flex-col px-3 pt-10 pb-3">
                                        <div className="flex flex-col gap-1.5">
                                          <p className="text-sm font-medium">
                                            Keep this recording uninterrupted
                                          </p>
                                          <p className="text-xs leading-relaxed text-muted-foreground">
                                            Audio is saved locally as you go.
                                            For uninterrupted capture, keep this
                                            browser open and your phone unlocked
                                            until you finish.
                                          </p>
                                        </div>
                                        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                                          <Button
                                            className="h-6 px-1.5 text-[11px]"
                                            size="xs"
                                            variant="ghost"
                                            disabled={isRecordingStarting}
                                            onClick={rememberNoticeAndRecord}
                                          >
                                            Don&apos;t show again
                                          </Button>
                                          <Button
                                            className="h-7"
                                            size="sm"
                                            onClick={startRecording}
                                            disabled={isRecordingStarting}
                                            autoFocus
                                          >
                                            Start recording
                                          </Button>
                                        </div>
                                      </div>
                                    }
                                  />
                                </>
                              )}

                              <p
                                className="min-h-5 truncate text-center text-xs text-muted-foreground"
                                aria-live="polite"
                              >
                                {selectedFile
                                  ? `${selectedFile.name}${contextFiles.length > 0 ? ` · ${contextFiles.length} context ${contextFiles.length === 1 ? "file" : "files"}` : ""}`
                                  : "MP3, WAV, AIFF, AAC, FLAC, OGG, or Opus · up to 100 MB"}
                              </p>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                        <AnimatePresence initial={false}>
                          {isProcessingFlow &&
                          processingState === "failure" &&
                          uploadedAudioId ? (
                            <motion.div
                              key="upload-processing-retry"
                              className="flex justify-center pt-4"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{
                                duration: shouldReduceMotion ? 0 : 0.22,
                                ease: "easeOut",
                              }}
                            >
                              <Button
                                className="h-9"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void processUploadedAudio(undefined, {
                                    source: processingSource,
                                  })
                                }
                              >
                                Try again
                              </Button>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            </motion.main>
          </div>

          <AvatarPickerDialog
            key={avatarPickerSession}
            animationSeed={avatarAnimationSeed}
            open={isAvatarPickerOpen}
            profile={profile}
            onOpenChange={setIsAvatarPickerOpen}
            onSave={saveProfile}
          />

          <FamilyDrawerPortal>
            <FamilyDrawerOverlay />
            <FamilyDrawerContent>
              <FamilyDrawerClose
                ariaLabel={
                  drawerMode === "recording"
                    ? "Close recording options"
                    : "Close upload flow"
                }
              />
              <FamilyDrawerAnimatedWrapper>
                <FamilyDrawerAnimatedContent>
                  {drawerMode === "recording" ? (
                    <RecordingDecision
                      key={liveRecordingId ?? "recording"}
                      duration={elapsedSeconds}
                      onContinueExisting={continueToDuplicateRecordingSession}
                      onDiscard={discardRecording}
                      onDiscardConfirmationChange={setIsConfirmingDiscard}
                      onProcessAgain={processDuplicateRecording}
                      onSave={saveAndContinue}
                    />
                  ) : (
                    <AudioUploadFlow
                      file={selectedFile}
                      contextFiles={contextFiles}
                      onChooseFile={setSelectedFile}
                      onAddContextFiles={addContextFiles}
                      onClearFile={() => setSelectedFile(undefined)}
                      onClearContextFiles={() => setContextFiles([])}
                      onDone={() => void processUploadedAudio()}
                      onContinueExisting={continueToDuplicateSession}
                      onProcessAgain={processDuplicateAudio}
                      onUpload={uploadSelectedFiles}
                    />
                  )}
                </FamilyDrawerAnimatedContent>
              </FamilyDrawerAnimatedWrapper>
            </FamilyDrawerContent>
          </FamilyDrawerPortal>
        </FamilyDrawerRoot>
      </div>
    </SidebarProvider>
  )
}
