import "server-only"

import { randomUUID } from "node:crypto"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import type { UploadKind } from "@/lib/uploads/validation"

const DEFAULT_BUCKET_NAME = "medpartner-dev"
const SIGNED_GET_URL_TTL_SECONDS = 60 * 60
const SIGNED_PUT_URL_TTL_SECONDS = 60 * 10

let cachedClient: S3Client | undefined

export function getR2BucketName() {
  return process.env.R2_BUCKET_NAME?.trim() || DEFAULT_BUCKET_NAME
}

export function createR2ObjectKey({
  fileId,
  fileName,
  kind,
  uploadId,
  userId,
}: {
  fileId: string
  fileName: string
  kind: UploadKind
  uploadId: string
  userId: string
}) {
  return [
    "users",
    userId,
    "uploads",
    uploadId,
    kind,
    `${fileId}-${sanitizeFileName(fileName)}`,
  ].join("/")
}

export function createR2AudioObjectKey({
  contentSha256,
  userId,
}: {
  contentSha256: string
  userId: string
}) {
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) {
    throw new Error("The audio fingerprint is invalid.")
  }

  return ["users", userId, "audio", "sha256", contentSha256].join("/")
}

export function createR2ReportObjectKey({
  reportId,
  revisionId,
  revisionNumber,
  sessionId,
  userId,
}: {
  reportId: string
  revisionId: string
  revisionNumber: number
  sessionId: string
  userId: string
}) {
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) {
    throw new Error("The report revision number is invalid.")
  }

  return [
    "users",
    userId,
    "sessions",
    sessionId,
    "reports",
    reportId,
    "revisions",
    `${revisionNumber.toString().padStart(4, "0")}-${revisionId}.docx`,
  ].join("/")
}

export function createR2TemplateSourceObjectKey({
  fileName,
  templateId,
  userId,
  versionId,
}: {
  fileName: string
  templateId: string
  userId: string
  versionId: string
}) {
  return [
    "users",
    userId,
    "templates",
    templateId,
    "versions",
    versionId,
    "source",
    sanitizeFileName(fileName),
  ].join("/")
}

export function createR2TemplateArtifactObjectKey({
  templateId,
  userId,
  versionId,
}: {
  templateId: string
  userId: string
  versionId: string
}) {
  return [
    "users",
    userId,
    "templates",
    templateId,
    "versions",
    versionId,
    "template.docx",
  ].join("/")
}

export async function createR2PresignedPutUrl({
  contentType,
  objectKey,
}: {
  contentType: string
  objectKey: string
}) {
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      ContentType: contentType,
      Key: objectKey,
    }),
    { expiresIn: SIGNED_PUT_URL_TTL_SECONDS }
  )

  return {
    expiresAt: new Date(
      Date.now() + SIGNED_PUT_URL_TTL_SECONDS * 1000
    ).toISOString(),
    uploadUrl,
  }
}

export async function createR2PresignedGetUrl(objectKey: string) {
  const downloadUrl = await getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: objectKey,
    }),
    { expiresIn: SIGNED_GET_URL_TTL_SECONDS }
  )

  return {
    downloadUrl,
    expiresAt: new Date(
      Date.now() + SIGNED_GET_URL_TTL_SECONDS * 1000
    ).toISOString(),
  }
}

export async function uploadBufferToR2({
  body,
  contentType,
  objectKey,
}: {
  body: Uint8Array
  contentType: string
  objectKey: string
}) {
  const result = await getR2Client().send(
    new PutObjectCommand({
      Body: body,
      Bucket: getR2BucketName(),
      ContentLength: body.byteLength,
      ContentType: contentType,
      Key: objectKey,
    })
  )

  return { etag: result.ETag ?? null }
}

export async function downloadR2Object(objectKey: string) {
  const result = await getR2Client().send(
    new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: objectKey,
    })
  )

  if (!result.Body) {
    throw new Error("R2 returned an empty object body.")
  }

  return {
    body: Buffer.from(await result.Body.transformToByteArray()),
    contentType: result.ContentType ?? null,
  }
}

export async function headR2Object(objectKey: string) {
  try {
    const object = await getR2Client().send(
      new HeadObjectCommand({
        Bucket: getR2BucketName(),
        Key: objectKey,
      })
    )

    return {
      contentType: object.ContentType,
      etag: object.ETag,
      size: object.ContentLength,
    }
  } catch (error) {
    const status =
      error && typeof error === "object" && "$metadata" in error
        ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
        : undefined

    if (status === 404) return
    throw error
  }
}

export async function deleteR2Object(objectKey: string) {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getR2BucketName(),
      Key: objectKey,
    })
  )
}

function getR2Client() {
  if (cachedClient) return cachedClient

  const endpoint = process.env.R2_JURISDICTION_ENDPOINT?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 environment variables are not configured.")
  }

  const parsedEndpoint = new URL(endpoint)
  if (parsedEndpoint.protocol !== "https:") {
    throw new Error("R2_JURISDICTION_ENDPOINT must use HTTPS.")
  }

  cachedClient = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint: parsedEndpoint.toString(),
    forcePathStyle: true,
    region: "auto",
  })

  return cachedClient
}

function sanitizeFileName(fileName: string) {
  return (
    fileName
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || `file-${randomUUID()}`
  )
}
