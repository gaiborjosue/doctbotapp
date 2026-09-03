import type { TemplateExtractionMode } from "@/lib/templates/validation"

export type TemplateFieldMapping = {
  confidence: number
  description: string
  fieldPath: string
  label: string
  placeholder: string
  sectionLabel: string
  slotId: string
  source: "content_control" | "inferred"
  /** Canonical clinical JSON paths that provide direct evidence, when known. */
  sourcePaths: string[]
}

export type TemplateStructure = {
  analysisChunkCount?: number
  contentControlCount: number
  paragraphCount: number
  placeholderCount: number
  styleNames: string[]
}

export type DocBotTemplateSummary = {
  createdAt: string
  description: string | null
  extractionMode: TemplateExtractionMode | null
  id: string
  isDefault: boolean
  mappingCount: number
  mappings: TemplateFieldMapping[]
  name: string
  status: "draft" | "active" | "archived"
  structure: TemplateStructure | null
  tags: string[]
  versionId: string | null
  versionNumber: number | null
  versionStatus: "uploaded" | "analyzing" | "ready" | "failed" | null
}
