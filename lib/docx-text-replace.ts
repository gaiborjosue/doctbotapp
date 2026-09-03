const WORD_PARAGRAPH_PATTERN = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gi
const WORD_CONTENT_PATTERN =
  /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)(?:\s[^>]*)?\/>/gi

type WordContentToken =
  | {
      kind: "separator"
      rawEnd: number
      rawStart: number
      text: string
    }
  | {
      contentEnd: number
      contentStart: number
      kind: "text"
      rawEnd: number
      rawStart: number
      text: string
    }

export function replaceTextInWordXml({
  replacement,
  search,
  xml,
}: {
  replacement: string
  search: string
  xml: string
}) {
  if (!search) return { count: 0, xml }

  let count = 0

  const updatedXml = xml.replace(WORD_PARAGRAPH_PATTERN, (paragraphXml) => {
    const replaced = replaceAcrossTextNodes({
      paragraphXml,
      replacement,
      search,
    })
    count += replaced.count
    return replaced.xml
  })

  return { count, xml: updatedXml }
}

function replaceAcrossTextNodes({
  paragraphXml,
  replacement,
  search,
}: {
  paragraphXml: string
  replacement: string
  search: string
}) {
  const tokens = Array.from(
    paragraphXml.matchAll(WORD_CONTENT_PATTERN),
    (match): WordContentToken => {
      const rawStart = match.index
      const rawEnd = rawStart + match[0].length
      if (match[2]) {
        return {
          kind: "separator",
          rawEnd,
          rawStart,
          text: match[2].toLocaleLowerCase("en") === "tab" ? "\t" : "\n",
        }
      }

      return {
        contentEnd: rawStart + match[0].lastIndexOf("</w:t>"),
        contentStart: rawStart + match[0].indexOf(">") + 1,
        kind: "text",
        rawEnd,
        rawStart,
        text: decodeXml(match[1] ?? ""),
      }
    }
  )
  if (tokens.length === 0) return { count: 0, xml: paragraphXml }

  const paragraphText = tokens.map((token) => token.text).join("")
  const occurrences: Array<{ end: number; start: number }> = []
  let offset = paragraphText.indexOf(search)
  while (offset >= 0) {
    occurrences.push({ end: offset + search.length, start: offset })
    offset = paragraphText.indexOf(search, offset + search.length)
  }
  if (occurrences.length === 0) return { count: 0, xml: paragraphXml }

  const tokenOffsets: Array<{ end: number; start: number }> = []
  let cursor = 0
  for (const token of tokens) {
    tokenOffsets.push({ end: cursor + token.text.length, start: cursor })
    cursor += token.text.length
  }

  const editsByNode = new Map<
    number,
    Array<{ end: number; replacement: string; start: number }>
  >()
  const separatorsToRemove = new Set<number>()
  const addEdit = (
    nodeIndex: number,
    edit: { end: number; replacement: string; start: number }
  ) => {
    const edits = editsByNode.get(nodeIndex) ?? []
    edits.push(edit)
    editsByNode.set(nodeIndex, edits)
  }

  for (const occurrence of occurrences) {
    const startNodeIndex = tokenOffsets.findIndex(
      (node) => occurrence.start >= node.start && occurrence.start < node.end
    )
    const endNodeIndex = findEndNodeIndex(tokenOffsets, occurrence.end)
    if (
      startNodeIndex < 0 ||
      endNodeIndex < startNodeIndex ||
      tokens[startNodeIndex].kind !== "text" ||
      tokens[endNodeIndex].kind !== "text"
    ) {
      continue
    }

    const startOffset = occurrence.start - tokenOffsets[startNodeIndex].start
    const endOffset = occurrence.end - tokenOffsets[endNodeIndex].start
    if (startNodeIndex === endNodeIndex) {
      addEdit(startNodeIndex, {
        end: endOffset,
        replacement,
        start: startOffset,
      })
      continue
    }

    addEdit(startNodeIndex, {
      end: tokens[startNodeIndex].text.length,
      replacement,
      start: startOffset,
    })
    for (let index = startNodeIndex + 1; index < endNodeIndex; index += 1) {
      if (tokens[index].kind === "separator") {
        separatorsToRemove.add(index)
      } else {
        addEdit(index, {
          end: tokens[index].text.length,
          replacement: "",
          start: 0,
        })
      }
    }
    addEdit(endNodeIndex, {
      end: endOffset,
      replacement: "",
      start: 0,
    })
  }

  const values = tokens.map((token, tokenIndex) => {
    let value = token.text
    const edits = editsByNode.get(tokenIndex) ?? []
    for (const edit of edits.sort((left, right) => right.start - left.start)) {
      value =
        value.slice(0, edit.start) + edit.replacement + value.slice(edit.end)
    }
    return value
  })

  if (editsByNode.size === 0 && separatorsToRemove.size === 0) {
    return { count: 0, xml: paragraphXml }
  }

  let updatedXml = paragraphXml
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token.kind === "separator") {
      if (separatorsToRemove.has(index)) {
        updatedXml =
          updatedXml.slice(0, token.rawStart) + updatedXml.slice(token.rawEnd)
      }
      continue
    }

    updatedXml =
      updatedXml.slice(0, token.contentStart) +
      escapeXml(values[index]) +
      updatedXml.slice(token.contentEnd)
  }

  return { count: occurrences.length, xml: updatedXml }
}

function findEndNodeIndex(
  nodes: Array<{ end: number; start: number }>,
  exclusiveEnd: number
) {
  if (exclusiveEnd <= 0) return -1
  return nodes.findIndex(
    (node) => exclusiveEnd - 1 >= node.start && exclusiveEnd - 1 < node.end
  )
}

function decodeXml(value: string) {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|amp|lt|gt|quot|apos);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10))
      if (hexadecimal) {
        return String.fromCodePoint(Number.parseInt(hexadecimal, 16))
      }
      switch (entity.toLocaleLowerCase("en")) {
        case "&amp;":
          return "&"
        case "&lt;":
          return "<"
        case "&gt;":
          return ">"
        case "&quot;":
          return '"'
        case "&apos;":
          return "'"
        default:
          return entity
      }
    }
  )
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}
