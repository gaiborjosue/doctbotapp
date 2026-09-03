import "server-only"

import { DocxEditor } from "@docx-editor.dev/editor-api"
import { z } from "zod"

const singleLineText = z
  .string()
  .refine((value) => !/[\r\n\v\f\u2028\u2029]/.test(value), {
    message: "DOCX text replacements must stay within one paragraph.",
  })

export const clinicalDocumentReplacementSchema = z
  .object({
    matchCase: z.boolean().optional().default(true),
    replaceAll: z.boolean().optional().default(false),
    replacement: singleLineText.max(2_000),
    search: singleLineText.trim().min(1).max(1_000),
  })
  .refine((operation) => operation.search !== operation.replacement, {
    message: "The replacement must change the document.",
  })

export type ClinicalDocumentReplacement = z.infer<
  typeof clinicalDocumentReplacementSchema
>

export async function readClinicalDocumentText(documentBytes: Uint8Array) {
  const runtime = await DocxEditor.createServer(documentBytes, {
    author: "DocBot",
  })

  try {
    let documentText = ""
    await runtime.run(async (context) => {
      const body = context.document.body
      body.load("text")
      await context.sync()
      documentText = body.text
    })
    return documentText
  } finally {
    runtime.dispose()
  }
}

export async function applyClinicalDocumentReplacements({
  documentBytes,
  replacements,
}: {
  documentBytes: Uint8Array
  replacements: ClinicalDocumentReplacement[]
}) {
  const parsedReplacements = z
    .array(clinicalDocumentReplacementSchema)
    .min(1)
    .max(8)
    .parse(replacements)
  const runtime = await DocxEditor.createServer(documentBytes, {
    author: "DocBot",
  })

  try {
    const operationResults: Array<{
      replacementCount: number
      search: string
    }> = []
    let documentText = ""

    await runtime.run(async (context) => {
      const body = context.document.body

      for (const operation of parsedReplacements) {
        const matches = body.search(operation.search, {
          matchCase: operation.matchCase,
        })
        matches.load()
        await context.sync()

        const selectedMatches = operation.replaceAll
          ? [...matches.items].reverse()
          : matches.items.slice(0, 1)

        for (const match of selectedMatches) {
          match.insertText(operation.replacement, "Replace")
          await context.sync()
        }

        operationResults.push({
          replacementCount: selectedMatches.length,
          search: operation.search,
        })
      }

      body.load("text")
      await context.sync()
      documentText = body.text
    })

    const replacementCount = operationResults.reduce(
      (total, result) => total + result.replacementCount,
      0
    )
    if (replacementCount === 0) {
      return {
        documentBytes: Buffer.from(documentBytes),
        documentText,
        operationResults,
        replacementCount,
      }
    }

    return {
      documentBytes: Buffer.from(await runtime.save()),
      documentText,
      operationResults,
      replacementCount,
    }
  } finally {
    runtime.dispose()
  }
}
