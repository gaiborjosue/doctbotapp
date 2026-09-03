import assert from "node:assert/strict"
import test from "node:test"

import { buildTemplateAnalysisChunks } from "../lib/templates/analysis-chunks.ts"

test("analyzes every paragraph without an eight-chunk or 300-paragraph cutoff", () => {
  const paragraphs = Array.from({ length: 640 }, (_, index) => ({
    style: "Normal",
    text: `FIELD_${String(index + 1).padStart(4, "0")} ${"clinical value ".repeat(8)}`,
  }))

  const chunks = buildTemplateAnalysisChunks(paragraphs, 1_200)
  const combined = chunks.join("\n")

  assert.ok(chunks.length > 8)
  assert.ok(chunks.every((chunk) => chunk.length <= 1_200))
  for (let index = 1; index <= paragraphs.length; index += 1) {
    assert.ok(combined.includes(`FIELD_${String(index).padStart(4, "0")}`))
  }
})

test("uses Word heading styles as stable section boundaries", () => {
  const chunks = buildTemplateAnalysisChunks(
    [
      { style: "Heading 1", text: "Antecedentes" },
      { style: "Normal", text: "Hipertensión desde 2018" },
      { style: "Título 1", text: "Tratamiento" },
      { style: "Normal", text: "Losartán 50 mg" },
    ],
    1_000
  )

  assert.equal(chunks.length, 2)
  assert.match(chunks[0], /<section heading="Antecedentes">/)
  assert.match(chunks[1], /<section heading="Tratamiento">/)
  assert.match(chunks[1], /Losartán 50 mg/)
})

test("splits a very long paragraph without losing its tail", () => {
  const chunks = buildTemplateAnalysisChunks(
    [
      {
        style: "Normal",
        text: `${"dato clínico & adicional ".repeat(180)}TAIL_MARKER`,
      },
    ],
    900
  )

  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((chunk) => chunk.length <= 900))
  assert.match(chunks.join("\n"), /fragment="2"/)
  assert.match(chunks.at(-1) ?? "", /TAIL_MARKER/)
})
