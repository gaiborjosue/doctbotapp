import { z } from "zod"

import { headR2Object } from "@/lib/r2-storage"
import { createClient } from "@/lib/supabase/server"
import { MAX_CONTEXT_FILES } from "@/lib/uploads/validation"

export const runtime = "nodejs"

const requestSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_CONTEXT_FILES + 1),
  uploadId: z.string().uuid(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  try {
    const payload = requestSchema.parse(await request.json())
    const { data: upload, error: uploadError } = await supabase
      .from("docbot_uploads")
      .select("id, status")
      .eq("id", payload.uploadId)
      .eq("user_id", claims.sub)
      .maybeSingle()

    if (uploadError) throw uploadError
    if (!upload) {
      return Response.json({ error: "Upload not found." }, { status: 404 })
    }

    const { data: files, error: filesError } = await supabase
      .from("docbot_upload_files")
      .select("id, object_key, mime_type, size_bytes, status")
      .eq("upload_id", upload.id)
      .eq("user_id", claims.sub)

    if (filesError) throw filesError

    const requestedIds = new Set(payload.fileIds)
    if (
      files.length !== requestedIds.size ||
      files.some((file) => !requestedIds.has(file.id))
    ) {
      return Response.json(
        { error: "The completed files do not match this upload." },
        { status: 400 }
      )
    }

    const verifiedFiles = await Promise.all(
      files.map(async (file) => {
        const object = await headR2Object(file.object_key)

        if (!object || object.size !== file.size_bytes) {
          throw new UploadVerificationError()
        }

        if (
          object.contentType &&
          object.contentType.toLowerCase() !== file.mime_type.toLowerCase()
        ) {
          throw new UploadVerificationError()
        }

        return { ...file, etag: object.etag ?? null }
      })
    )

    const uploadedAt = new Date().toISOString()
    const updateResults = await Promise.all(
      verifiedFiles.map((file) =>
        supabase
          .from("docbot_upload_files")
          .update({
            etag: file.etag,
            status: "uploaded",
            uploaded_at: uploadedAt,
          })
          .eq("id", file.id)
          .eq("upload_id", upload.id)
      )
    )
    const fileUpdateError = updateResults.find((result) => result.error)?.error
    if (fileUpdateError) throw fileUpdateError

    const { error: completeError } = await supabase
      .from("docbot_uploads")
      .update({ status: "uploaded", updated_at: uploadedAt })
      .eq("id", upload.id)

    if (completeError) throw completeError

    return Response.json({
      uploadId: upload.id,
      status: "uploaded",
      fileCount: verifiedFiles.length,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "The upload confirmation is invalid." },
        { status: 400 }
      )
    }

    if (error instanceof UploadVerificationError) {
      return Response.json(
        { error: "One or more uploaded files could not be verified." },
        { status: 409 }
      )
    }

    console.error("[api/uploads/complete] failed", {
      message: error instanceof Error ? error.message : String(error),
    })

    return Response.json(
      { error: "The upload could not be completed." },
      { status: 500 }
    )
  }
}

class UploadVerificationError extends Error {}
