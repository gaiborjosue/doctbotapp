"use client"

import {
  ArchiveIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileTextIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  activateTemplateProfile,
  archiveTemplateProfile,
  deleteTemplateProfile,
  getTemplateProfiles,
  uploadAndAnalyzeTemplate,
} from "@/lib/templates/client"
import type {
  DocBotTemplateSummary,
  TemplateFieldMapping,
  TemplateStructure,
} from "@/lib/templates/types"
import {
  DOCX_MIME_TYPE,
  parseTagInput,
  type TemplateExtractionMode,
  validateTemplateFileDescriptor,
} from "@/lib/templates/validation"
import { cn } from "@/lib/utils"

type DialogView = "list" | "new" | "review"

type TemplateReview = {
  mappings: TemplateFieldMapping[]
  notes: string[]
  structure: TemplateStructure
  templateId: string
}

const EXTRACTION_OPTIONS = [
  {
    label: "Layout + writing style",
    value: "structure_and_wording",
  },
  { label: "Layout only", value: "structure_only" },
] satisfies Array<{ label: string; value: TemplateExtractionMode }>

export function TemplateManagerDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const [view, setView] = useState<DialogView>("list")
  const [templates, setTemplates] = useState<DocBotTemplateSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string>()
  const [file, setFile] = useState<File>()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [extractionMode, setExtractionMode] = useState<TemplateExtractionMode>(
    "structure_and_wording"
  )
  const [review, setReview] = useState<TemplateReview>()
  const [tagInput, setTagInput] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [deleteCandidateId, setDeleteCandidateId] = useState<string>()

  const loadTemplates = useCallback(async () => {
    setIsLoading(true)
    setError(undefined)
    try {
      setTemplates(await getTemplateProfiles())
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The templates could not be loaded."
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void getTemplateProfiles()
      .then((profiles) => {
        if (!cancelled) setTemplates(profiles)
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The templates could not be loaded."
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  function resetDraft() {
    setFile(undefined)
    setName("")
    setDescription("")
    setExtractionMode("structure_and_wording")
    setReview(undefined)
    setTagInput("")
    setIsDefault(false)
    setProgress(0)
    setError(undefined)
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0]
    event.target.value = ""
    if (!candidate) return

    const validationError = validateTemplateFileDescriptor({
      fileName: candidate.name,
      mimeType: candidate.type,
      size: candidate.size,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    setError(undefined)
    setFile(candidate)
    if (!name.trim()) {
      setName(candidate.name.replace(/\.docx$/i, "").slice(0, 80))
    }
  }

  async function analyzeTemplate() {
    if (!file || !name.trim() || isSubmitting) return
    setIsSubmitting(true)
    setProgress(0)
    setError(undefined)

    try {
      const result = await uploadAndAnalyzeTemplate({
        description,
        extractionMode,
        file,
        name: name.trim(),
        onProgress: setProgress,
      })
      setReview({
        mappings: result.mappings,
        notes: result.notes,
        structure: result.structure,
        templateId: result.templateId,
      })
      setView("review")
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The DOCX could not be analyzed."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function activateTemplate() {
    if (!review || isSubmitting) return
    setIsSubmitting(true)
    setError(undefined)
    try {
      await activateTemplateProfile({
        isDefault,
        tags: parseTagInput(tagInput),
        templateId: review.templateId,
      })
      await loadTemplates()
      resetDraft()
      setView("list")
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "The template could not be activated."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function archiveTemplate(templateId: string) {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(undefined)
    try {
      await archiveTemplateProfile(templateId)
      await loadTemplates()
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "The template could not be archived."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function deleteTemplate(templateId: string) {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(undefined)
    try {
      await deleteTemplateProfile(templateId)
      setDeleteCandidateId(undefined)
      await loadTemplates()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The template could not be deleted."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setDeleteCandidateId(undefined)
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="max-h-[calc(100svh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-4 pt-4 pb-3 sm:px-5">
          <DialogTitle>
            {view === "list"
              ? "Document templates"
              : view === "new"
                ? "Add a DOCX example"
                : "Review template"}
          </DialogTitle>
          <DialogDescription>
            {view === "list"
              ? "Reuse your preferred clinical-document layouts and writing style."
              : view === "new"
                ? "DocBot converts a completed example into a reusable, private template."
                : "Confirm the reusable fields and choose when this template applies."}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="px-4 py-4 sm:px-5"
            exit={{ opacity: 0, x: -8 }}
            initial={{ opacity: 0, x: 8 }}
            key={view}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
          >
            {view === "list" ? (
              <TemplateList
                isLoading={isLoading}
                isPending={isSubmitting}
                deleteCandidateId={deleteCandidateId}
                templates={templates}
                onArchive={(templateId) => void archiveTemplate(templateId)}
                onCreate={() => {
                  resetDraft()
                  setView("new")
                }}
                onManage={(template) => {
                  if (!template.structure) return
                  setReview({
                    mappings: template.mappings,
                    notes: [],
                    structure: template.structure,
                    templateId: template.id,
                  })
                  setTagInput(template.tags.join(", "))
                  setIsDefault(template.isDefault)
                  setError(undefined)
                  setView("review")
                }}
                onDeleteCancel={() => setDeleteCandidateId(undefined)}
                onDeleteConfirm={(templateId) =>
                  void deleteTemplate(templateId)
                }
                onDeleteRequest={setDeleteCandidateId}
              />
            ) : view === "new" ? (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="template-name">Template name</FieldLabel>
                  <Input
                    id="template-name"
                    maxLength={80}
                    onChange={(event) => setName(event.currentTarget.value)}
                    placeholder="e.g. Internal medicine"
                    value={name}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="template-description">
                    Description{" "}
                    <span className="text-muted-foreground">Optional</span>
                  </FieldLabel>
                  <Textarea
                    className="min-h-16 resize-none"
                    id="template-description"
                    maxLength={500}
                    onChange={(event) =>
                      setDescription(event.currentTarget.value)
                    }
                    placeholder="When should this format be used?"
                    value={description}
                  />
                </Field>

                <Field>
                  <FieldLabel>Reuse from example</FieldLabel>
                  <Select
                    items={EXTRACTION_OPTIONS}
                    onValueChange={(value) =>
                      setExtractionMode(value as TemplateExtractionMode)
                    }
                    value={extractionMode}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {EXTRACTION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Layout only ignores example-specific narrative style. Layout
                    + writing style keeps reusable clinical phrasing.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Completed DOCX example</FieldLabel>
                  <button
                    className={cn(
                      "flex min-h-28 w-full items-center gap-3 rounded-xl border border-dashed bg-muted/25 px-4 text-left transition-colors outline-none hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/30",
                      file && "border-solid bg-muted/40"
                    )}
                    disabled={isSubmitting}
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background">
                      {file ? <FileTextIcon /> : <UploadIcon />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {file?.name ?? "Choose a Word document"}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        .docx · up to 10 MB
                      </span>
                    </span>
                  </button>
                  <input
                    accept={`.docx,${DOCX_MIME_TYPE}`}
                    className="sr-only"
                    onChange={chooseFile}
                    ref={fileInputRef}
                    tabIndex={-1}
                    type="file"
                  />
                </Field>

                <div className="flex items-start gap-2 rounded-lg border bg-muted/25 p-3 text-xs text-muted-foreground">
                  <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
                  <p>
                    The filled example is uploaded to private R2 only for
                    conversion, then deleted. The sanitized, versioned template
                    remains in R2.
                  </p>
                </div>

                {isSubmitting ? (
                  <div className="space-y-2" role="status">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {progress < 55
                          ? "Uploading privately…"
                          : "Finding reusable fields…"}
                      </span>
                      <span className="tabular-nums">{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                ) : null}
              </FieldGroup>
            ) : review ? (
              <TemplateReviewPanel
                isDefault={isDefault}
                review={review}
                tagInput={tagInput}
                onDefaultChange={() => setIsDefault((current) => !current)}
                onTagInputChange={setTagInput}
              />
            ) : null}

            {error ? <FieldError className="mt-4">{error}</FieldError> : null}
          </motion.div>
        </AnimatePresence>

        {view !== "list" ? (
          <DialogFooter className="border-t px-4 py-3 sm:px-5">
            <Button
              disabled={isSubmitting}
              onClick={() => {
                setError(undefined)
                setView(view === "review" ? "new" : "list")
              }}
              variant="outline"
            >
              Back
            </Button>
            <Button
              disabled={
                isSubmitting ||
                (view === "new"
                  ? !file || !name.trim()
                  : !review ||
                    (!isDefault && parseTagInput(tagInput).length === 0))
              }
              onClick={() =>
                view === "new"
                  ? void analyzeTemplate()
                  : void activateTemplate()
              }
            >
              {isSubmitting ? <Spinner /> : null}
              {view === "new" ? "Analyze example" : "Activate template"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function TemplateList({
  deleteCandidateId,
  isLoading,
  isPending,
  onArchive,
  onCreate,
  onDeleteCancel,
  onDeleteConfirm,
  onDeleteRequest,
  onManage,
  templates,
}: {
  deleteCandidateId?: string
  isLoading: boolean
  isPending: boolean
  onArchive: (templateId: string) => void
  onCreate: () => void
  onDeleteCancel: () => void
  onDeleteConfirm: (templateId: string) => void
  onDeleteRequest: (templateId: string) => void
  onManage: (template: DocBotTemplateSummary) => void
  templates: DocBotTemplateSummary[]
}) {
  const availableTemplates = templates.filter(
    (template) => template.status !== "archived"
  )
  const archivedTemplates = templates.filter(
    (template) => template.status === "archived"
  )

  function renderTemplate(template: DocBotTemplateSummary) {
    const isConfirmingDelete = deleteCandidateId === template.id

    return (
      <div
        className="relative overflow-hidden rounded-xl border p-3"
        key={template.id}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-medium">{template.name}</p>
              <Badge
                variant={template.status === "active" ? "default" : "secondary"}
              >
                {template.status}
              </Badge>
              {template.isDefault ? (
                <Badge variant="outline">Default</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {template.versionNumber
                ? `v${template.versionNumber} · ${template.mappingCount} mapped fields`
                : template.versionStatus === "failed"
                  ? "Analysis failed"
                  : "Waiting for activation"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {template.versionStatus === "ready" && template.structure ? (
              <Button
                aria-label={`Configure ${template.name}`}
                disabled={isPending}
                onClick={() => onManage(template)}
                size="xs"
                variant="ghost"
              >
                Configure
              </Button>
            ) : null}
            {template.status === "active" ? (
              <Button
                nativeButton={false}
                render={
                  <a
                    aria-label={`Download ${template.name}`}
                    href={`/api/templates/${template.id}/document`}
                  />
                }
                size="icon-xs"
                variant="ghost"
              >
                <DownloadIcon />
              </Button>
            ) : null}
            {template.status !== "archived" ? (
              <Button
                aria-label={`Archive ${template.name}`}
                disabled={isPending}
                onClick={() => onArchive(template.id)}
                size="icon-xs"
                title="Archive template"
                variant="ghost"
              >
                <ArchiveIcon />
              </Button>
            ) : null}
            <Button
              aria-label={`Delete ${template.name}`}
              disabled={isPending}
              onClick={() => onDeleteRequest(template.id)}
              size="icon-xs"
              title="Delete template permanently"
              variant="ghost"
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
        {template.description ? (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {template.description}
          </p>
        ) : null}
        {template.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {template.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {isConfirmingDelete ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-10 flex items-center justify-between gap-3 bg-background px-3"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  Delete {template.name} permanently?
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                  Its stored template file will also be removed.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  disabled={isPending}
                  onClick={onDeleteCancel}
                  size="xs"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  disabled={isPending}
                  onClick={() => onDeleteConfirm(template.id)}
                  size="xs"
                  variant="destructive"
                >
                  {isPending ? <Spinner /> : null}
                  Delete
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={onCreate}>
        <PlusIcon data-icon="inline-start" />
        Add template
      </Button>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <Spinner /> Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-8 text-center">
          <FileTextIcon className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No custom templates yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The built-in clinical history template remains the default.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {availableTemplates.map(renderTemplate)}
          {archivedTemplates.length > 0 ? (
            <div className="pt-2">
              <p className="mb-2 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
                Archived
              </p>
              <div className="space-y-2">
                {archivedTemplates.map(renderTemplate)}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function TemplateReviewPanel({
  isDefault,
  onDefaultChange,
  onTagInputChange,
  review,
  tagInput,
}: {
  isDefault: boolean
  onDefaultChange: () => void
  onTagInputChange: (value: string) => void
  review: TemplateReview
  tagInput: string
}) {
  return (
    <FieldGroup>
      <div className="flex items-start gap-3 rounded-xl border bg-muted/25 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <CheckCircle2Icon className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">Reusable template ready</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {review.structure.paragraphCount} paragraphs ·{" "}
            {review.structure.placeholderCount} placeholders ·{" "}
            {review.mappings.length} reusable fields
            {review.structure.analysisChunkCount &&
            review.structure.analysisChunkCount > 1
              ? ` · ${review.structure.analysisChunkCount} analysis passes`
              : ""}
          </p>
        </div>
      </div>

      <Field>
        <FieldLabel>Fields defined by this template</FieldLabel>
        <div className="max-h-44 overflow-y-auto rounded-lg border p-1.5">
          <div className="space-y-1">
            {review.mappings.map((mapping) => (
              <div
                className="rounded-md bg-muted/45 px-2 py-1.5"
                key={mapping.slotId}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-xs font-medium">
                    {mapping.label}
                  </span>
                  <Badge className="shrink-0" variant="outline">
                    {mapping.sectionLabel}
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                  {mapping.description}
                </p>
              </div>
            ))}
          </div>
        </div>
        <FieldDescription>
          These fields come from the uploaded document, not DocBot&apos;s
          built-in template. Patient values from the example are not retained.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="template-tags">Use for session tags</FieldLabel>
        <Input
          id="template-tags"
          onChange={(event) => onTagInputChange(event.currentTarget.value)}
          placeholder="e.g. cardiology, inpatient"
          value={tagInput}
        />
        <FieldDescription>
          Separate tags with commas. A matching session uses this template.
        </FieldDescription>
      </Field>

      <button
        aria-pressed={isDefault}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30",
          isDefault && "border-foreground bg-muted/50"
        )}
        onClick={onDefaultChange}
        type="button"
      >
        <span>
          <span className="block text-xs font-medium">Use as default</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Applies when no session tag rule matches.
          </span>
        </span>
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full border",
            isDefault && "border-foreground bg-foreground text-background"
          )}
        >
          {isDefault ? <CheckCircle2Icon className="size-3" /> : null}
        </span>
      </button>

      {review.notes.length > 0 ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          <p className="text-xs font-medium">Review notes</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {review.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </FieldGroup>
  )
}
