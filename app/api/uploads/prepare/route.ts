import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  createR2AudioObjectKey,
  createR2ObjectKey,
  createR2PresignedPutUrl,
  getR2BucketName,
} from "@/lib/r2-storage"
import { getLatestDocBotSessionForUpload } from "@/lib/sessions/server"
import { createClient } from "@/lib/supabase/server"
import {
  MAX_CONTEXT_FILES,
  validateUploadDescriptor,
} from "@/lib/uploads/validation"

export const runtime = "nodejs"

const fileSchema = z
  .object({
    contentSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    fileName: z.string().trim().min(1).max(255),
    kind: z.enum(["audio", "image", "file"]),
    mimeType: z.string().trim().min(1).max(255),
    size: z.number().int().positive(),
  })
  .superRefine((file, context) => {
    if (file.kind === "audio" && !file.contentSha256) {
      context.addIssue({
        code: "custom",
        message: "Audio files require a SHA-256 fingerprint.",
        path: ["contentSha256"],
      })
    }

    if (file.kind !== "audio" && file.contentSha256) {
      context.addIssue({
        code: "custom",
        message: "Only audio files may include a fingerprint.",
        path: ["contentSha256"],
      })
    }
  })

const requestSchema = z.object({
  files: z
    .array(fileSchema)
    .min(1)
    .max(MAX_CONTEXT_FILES + 1),
  source: z.enum(["recording", "upload"]).default("upload"),
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
    const audioFiles = payload.files.filter((file) => file.kind === "audio")

    if (audioFiles.length !== 1) {
      return Response.json(
        { error: "Each upload must contain exactly one audio file." },
        { status: 400 }
      )
    }

    for (const descriptor of payload.files) {
      const validationError = validateUploadDescriptor(descriptor)
      if (validationError) {
        return Response.json({ error: validationError }, { status: 400 })
      }
    }

    const audioDescriptor = audioFiles[0]
    const existingAudio = await findExistingAudio({
      contentSha256: audioDescriptor.contentSha256!,
      supabase,
      userId: claims.sub,
    })

    if (existingAudio) {
      if (existingAudio.status === "pending") {
        return Response.json(
          { error: "This exact audio is already being uploaded." },
          { status: 409 }
        )
      }

      return duplicateUploadResponse({
        existingAudio,
        supabase,
        userId: claims.sub,
      })
    }

    const uploadId = randomUUID()
    const bucketName = getR2BucketName()
    const preparedFiles = await Promise.all(
      payload.files.map(async (descriptor) => {
        const fileId = randomUUID()
        const objectKey =
          descriptor.kind === "audio"
            ? createR2AudioObjectKey({
                contentSha256: descriptor.contentSha256!,
                userId: claims.sub,
              })
            : createR2ObjectKey({
                fileId,
                fileName: descriptor.fileName,
                kind: descriptor.kind,
                uploadId,
                userId: claims.sub,
              })
        const signedUpload = await createR2PresignedPutUrl({
          contentType: descriptor.mimeType,
          objectKey,
        })

        return {
          ...descriptor,
          ...signedUpload,
          fileId,
          objectKey,
        }
      })
    )

    const { error: uploadError } = await supabase
      .from("docbot_uploads")
      .insert({
        id: uploadId,
        source: payload.source,
        status: "uploading",
        user_id: claims.sub,
      })

    if (uploadError) throw uploadError

    const { error: filesError } = await supabase
      .from("docbot_upload_files")
      .insert(
        preparedFiles.map((file) => ({
          bucket_name: bucketName,
          content_sha256: file.contentSha256 ?? null,
          id: file.fileId,
          kind: file.kind,
          mime_type: file.mimeType,
          object_key: file.objectKey,
          original_name: file.fileName,
          size_bytes: file.size,
          status: "pending",
          upload_id: uploadId,
          user_id: claims.sub,
        }))
      )

    if (filesError) {
      await supabase
        .from("docbot_uploads")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadId)

      if (filesError.code === "23505") {
        const concurrentAudio = await findExistingAudio({
          contentSha256: audioDescriptor.contentSha256!,
          supabase,
          userId: claims.sub,
        })

        if (concurrentAudio?.status === "uploaded") {
          return duplicateUploadResponse({
            existingAudio: concurrentAudio,
            supabase,
            userId: claims.sub,
          })
        }

        if (concurrentAudio) {
          return Response.json(
            { error: "This exact audio is already being uploaded." },
            { status: 409 }
          )
        }
      }

      throw filesError
    }

    return Response.json({
      status: "prepared",
      uploadId,
      files: preparedFiles.map((file) => ({
        expiresAt: file.expiresAt,
        fileId: file.fileId,
        kind: file.kind,
        mimeType: file.mimeType,
        objectKey: file.objectKey,
        uploadUrl: file.uploadUrl,
      })),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "The upload request is invalid." },
        { status: 400 }
      )
    }

    console.error("[api/uploads/prepare] failed", {
      message: error instanceof Error ? error.message : String(error),
    })

    return Response.json(
      { error: "The upload could not be prepared." },
      { status: 500 }
    )
  }
}

async function findExistingAudio({
  contentSha256,
  supabase,
  userId,
}: {
  contentSha256: string
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}) {
  const { data, error } = await supabase
    .from("docbot_upload_files")
    .select("original_name, status, upload_id")
    .eq("user_id", userId)
    .eq("kind", "audio")
    .eq("content_sha256", contentSha256)
    .in("status", ["pending", "uploaded"])
    .order("uploaded_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

async function duplicateUploadResponse({
  existingAudio,
  supabase,
  userId,
}: {
  existingAudio: {
    original_name: string
    upload_id: string
  }
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}) {
  const session = await getLatestDocBotSessionForUpload(
    supabase,
    userId,
    existingAudio.upload_id
  )

  return Response.json({
    status: "duplicate",
    duplicate: {
      fileName: existingAudio.original_name,
      session,
      uploadId: existingAudio.upload_id,
    },
  })
}
