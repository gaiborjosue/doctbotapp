import { z } from "zod"

import { createR2PresignedPutUrl } from "@/lib/r2-storage"
import { createClient } from "@/lib/supabase/server"
import { createTemplateUploadRecord } from "@/lib/templates/server"
import {
  prepareTemplateUploadSchema,
  validateTemplateFileDescriptor,
} from "@/lib/templates/validation"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  try {
    const payload = prepareTemplateUploadSchema.parse(await request.json())
    const validationError = validateTemplateFileDescriptor(payload)
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 })
    }

    const record = await createTemplateUploadRecord({
      contentSha256: payload.contentSha256,
      description: payload.description,
      extractionMode: payload.extractionMode,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      name: payload.name,
      size: payload.size,
      supabase,
      userId: claims.sub,
    })
    const signed = await createR2PresignedPutUrl({
      contentType: payload.mimeType,
      objectKey: record.sourceObjectKey,
    })

    return Response.json({
      expiresAt: signed.expiresAt,
      status: "prepared",
      templateId: record.templateId,
      uploadUrl: signed.uploadUrl,
      versionId: record.versionId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "The template upload request is invalid." },
        { status: 400 }
      )
    }

    console.error("[api/templates/upload/prepare] failed", {
      message: error instanceof Error ? error.message : String(error),
      userId: claims.sub,
    })
    return Response.json(
      { error: "The template upload could not be prepared." },
      { status: 500 }
    )
  }
}
