import { z } from "zod"

import { deleteR2Object } from "@/lib/r2-storage"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const requestSchema = z.object({
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

    if (upload.status !== "uploading") {
      return Response.json(
        { error: "Only an in-progress upload can be cancelled." },
        { status: 409 }
      )
    }

    const { data: files, error: filesError } = await supabase
      .from("docbot_upload_files")
      .select("object_key")
      .eq("upload_id", upload.id)
      .eq("user_id", claims.sub)

    if (filesError) throw filesError

    await Promise.all(files.map((file) => deleteR2Object(file.object_key)))

    const failedAt = new Date().toISOString()
    const [{ error: fileUpdateError }, { error: uploadUpdateError }] =
      await Promise.all([
        supabase
          .from("docbot_upload_files")
          .update({ status: "failed" })
          .eq("upload_id", upload.id)
          .eq("user_id", claims.sub),
        supabase
          .from("docbot_uploads")
          .update({ status: "failed", updated_at: failedAt })
          .eq("id", upload.id)
          .eq("user_id", claims.sub),
      ])

    if (fileUpdateError) throw fileUpdateError
    if (uploadUpdateError) throw uploadUpdateError

    return Response.json({ status: "cancelled", uploadId: upload.id })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "The cancellation request is invalid." },
        { status: 400 }
      )
    }

    console.error("[api/uploads/cancel] failed", {
      message: error instanceof Error ? error.message : String(error),
    })

    return Response.json(
      { error: "The upload could not be cancelled." },
      { status: 500 }
    )
  }
}
