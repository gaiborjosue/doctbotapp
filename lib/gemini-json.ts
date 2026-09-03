export function parseGeminiJsonObject(outputText: string): unknown {
  const normalized = outputText.replace(/^\uFEFF/, "").trim()
  const candidates = new Set<string>()

  if (normalized) candidates.add(normalized)

  const fencedMatch = normalized.match(
    /^```(?:json|application\/json)?\s*([\s\S]*?)\s*```$/i
  )
  if (fencedMatch?.[1]) candidates.add(fencedMatch[1].trim())

  const extractedObject = extractFirstCompleteJsonObject(normalized)
  if (extractedObject) candidates.add(extractedObject)

  let parseError: unknown
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown

      if (typeof parsed !== "string") return parsed

      const nestedCandidate = parsed.replace(/^\uFEFF/, "").trim()
      if (nestedCandidate.startsWith("{")) {
        return JSON.parse(nestedCandidate) as unknown
      }
    } catch (error) {
      parseError = error
    }
  }

  throw new Error("Gemini returned invalid clinical JSON.", {
    cause: parseError,
  })
}

function extractFirstCompleteJsonObject(value: string) {
  const start = value.indexOf("{")
  if (start === -1) return null

  let depth = 0
  let escaped = false
  let inString = false

  for (let index = start; index < value.length; index += 1) {
    const character = value[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === "\\") {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
      continue
    }
    if (character === "{") depth += 1
    if (character !== "}") continue

    depth -= 1
    if (depth === 0) return value.slice(start, index + 1)
  }

  return null
}
