export type TemplateAnalysisParagraph = {
  style: string
  text: string
}

export const TEMPLATE_ANALYSIS_CHUNK_MAX_CHARS = 15_000

type IndexedParagraph = TemplateAnalysisParagraph & {
  index: number
}

type TemplateSection = {
  heading: string
  paragraphs: IndexedParagraph[]
}

export function buildTemplateAnalysisChunks(
  paragraphs: TemplateAnalysisParagraph[],
  maxChars = TEMPLATE_ANALYSIS_CHUNK_MAX_CHARS
) {
  if (maxChars < 512) {
    throw new Error(
      "Template analysis chunks must allow at least 512 characters."
    )
  }

  return createSections(paragraphs).flatMap((section) =>
    serializeSection(section, maxChars)
  )
}

function createSections(paragraphs: TemplateAnalysisParagraph[]) {
  const sections: TemplateSection[] = []
  let current: TemplateSection = { heading: "Documento", paragraphs: [] }

  for (const [offset, paragraph] of paragraphs.entries()) {
    const indexed = { ...paragraph, index: offset + 1 }
    if (isHeadingStyle(paragraph.style) && current.paragraphs.length > 0) {
      sections.push(current)
      current = { heading: paragraph.text, paragraphs: [indexed] }
      continue
    }

    if (isHeadingStyle(paragraph.style)) current.heading = paragraph.text
    current.paragraphs.push(indexed)
  }

  if (current.paragraphs.length > 0) sections.push(current)
  return sections
}

function serializeSection(section: TemplateSection, maxChars: number) {
  const opening = `<section heading="${escapeAttribute(
    section.heading.slice(0, 160)
  )}">`
  const closing = "</section>"
  const fixedLength = opening.length + closing.length + 2
  const availableRecordChars = maxChars - fixedLength
  const records = section.paragraphs.flatMap((paragraph) =>
    serializeParagraphFragments(paragraph, availableRecordChars)
  )
  const chunks: string[] = []
  let currentRecords: string[] = []
  let currentLength = fixedLength

  for (const record of records) {
    const separatorLength = currentRecords.length > 0 ? 1 : 0
    if (
      currentRecords.length > 0 &&
      currentLength + separatorLength + record.length > maxChars
    ) {
      chunks.push(wrapSection(opening, closing, currentRecords))
      currentRecords = []
      currentLength = fixedLength
    }

    currentRecords.push(record)
    currentLength += (currentRecords.length > 1 ? 1 : 0) + record.length
  }

  if (currentRecords.length > 0) {
    chunks.push(wrapSection(opening, closing, currentRecords))
  }
  return chunks
}

function serializeParagraphFragments(
  paragraph: IndexedParagraph,
  maxRecordChars: number
) {
  const complete = serializeParagraph(paragraph, paragraph.text, 1)
  if (complete.length <= maxRecordChars) return [complete]

  const fragments: string[] = []
  let remaining = paragraph.text
  let fragment = 1

  while (remaining) {
    const prefixLength = findLargestFittingPrefix(
      paragraph,
      remaining,
      fragment,
      maxRecordChars
    )
    if (prefixLength < 1) {
      throw new Error(
        "A template paragraph could not fit in an analysis chunk."
      )
    }

    const splitAt = findNaturalSplit(remaining, prefixLength)
    const text = remaining.slice(0, splitAt)
    fragments.push(serializeParagraph(paragraph, text, fragment))
    remaining = remaining.slice(splitAt)
    fragment += 1
  }

  return fragments
}

function findLargestFittingPrefix(
  paragraph: IndexedParagraph,
  text: string,
  fragment: number,
  maxRecordChars: number
) {
  let low = 1
  let high = text.length
  let best = 0

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const length = serializeParagraph(
      paragraph,
      text.slice(0, middle),
      fragment
    ).length
    if (length <= maxRecordChars) {
      best = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return best
}

function findNaturalSplit(text: string, maximum: number) {
  if (maximum >= text.length) return text.length
  const minimum = Math.floor(maximum * 0.65)
  for (let index = maximum; index >= minimum; index -= 1) {
    if (/\s/.test(text[index - 1] ?? "")) return index
  }
  return maximum
}

function serializeParagraph(
  paragraph: IndexedParagraph,
  text: string,
  fragment: number
) {
  return `<paragraph index="${paragraph.index}" fragment="${fragment}" style="${escapeAttribute(paragraph.style)}">${escapeXmlText(text)}</paragraph>`
}

function wrapSection(opening: string, closing: string, records: string[]) {
  return `${opening}\n${records.join("\n")}\n${closing}`
}

function isHeadingStyle(style: string) {
  const normalized = style
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replaceAll("_", " ")

  return /^(?:heading|titulo|title|encabezado)(?:\s*\d+)?$/.test(normalized)
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}

function escapeXmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
