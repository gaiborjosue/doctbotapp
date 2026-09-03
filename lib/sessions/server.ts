import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { deleteR2Object } from "@/lib/r2-storage"
import type { DocBotSessionSummary } from "@/lib/sessions/types"
import type { Database } from "@/lib/supabase/database.types"

const DEFAULT_SESSION_LIMIT = 50
const ACTIVE_PROCESSING_STATUSES = ["preparing", "queued", "in_progress"]
export type DocBotSessionScope = "active" | "archived"

export async function getDocBotSessionSummaries(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = DEFAULT_SESSION_LIMIT,
  scope: DocBotSessionScope = "active"
): Promise<DocBotSessionSummary[]> {
  const sessionsQuery = supabase
    .from("docbot_sessions")
    .select(
      "id, title, created_at, last_activity_at, processing_job_id, upload_id"
    )
    .eq("user_id", userId)

  const scopedQuery =
    scope === "archived"
      ? sessionsQuery.not("archived_at", "is", null)
      : sessionsQuery.is("archived_at", null)
  const { data, error } = await scopedQuery
    .order("last_activity_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error("Unable to load DocBot sessions.", { cause: error })
  }

  return attachSessionTags(supabase, userId, data.map(toDocBotSessionSummary))
}

export async function getLatestDocBotSessionForUpload(
  supabase: SupabaseClient<Database>,
  userId: string,
  uploadId: string
): Promise<DocBotSessionSummary | null> {
  const { data, error } = await supabase
    .from("docbot_sessions")
    .select(
      "id, title, created_at, last_activity_at, processing_job_id, upload_id"
    )
    .eq("user_id", userId)
    .eq("upload_id", uploadId)
    .is("archived_at", null)
    .order("last_activity_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error("Unable to load the existing DocBot session.", {
      cause: error,
    })
  }

  if (!data) return null
  return (
    await attachSessionTags(supabase, userId, [toDocBotSessionSummary(data)])
  )[0]
}

export async function renameDocBotSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  title: string
) {
  const { data, error } = await supabase
    .from("docbot_sessions")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select(
      "id, title, created_at, last_activity_at, processing_job_id, upload_id"
    )
    .maybeSingle()

  if (error) {
    throw new Error("Unable to rename the DocBot session.", { cause: error })
  }

  if (!data) return null
  return (
    await attachSessionTags(supabase, userId, [toDocBotSessionSummary(data)])
  )[0]
}

export async function archiveDocBotSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
) {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("docbot_sessions")
    .update({ archived_at: now, updated_at: now })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new Error("Unable to archive the DocBot session.", { cause: error })
  }

  return Boolean(data)
}

export async function unarchiveDocBotSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
) {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("docbot_sessions")
    .update({ archived_at: null, updated_at: now })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .not("archived_at", "is", null)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new Error("Unable to restore the DocBot session.", { cause: error })
  }

  return Boolean(data)
}

export async function deleteDocBotSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
) {
  const { data: session, error: sessionError } = await supabase
    .from("docbot_sessions")
    .select("id, processing_job_id, upload_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle()

  if (sessionError) {
    throw new Error("Unable to load the DocBot session for deletion.", {
      cause: sessionError,
    })
  }

  if (!session) return false

  const [otherSessionResult, activeJobResult, audioFileResult] =
    await Promise.all([
      supabase
        .from("docbot_sessions")
        .select("id")
        .eq("upload_id", session.upload_id)
        .eq("user_id", userId)
        .neq("id", session.id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("docbot_processing_jobs")
        .select("id")
        .eq("upload_id", session.upload_id)
        .eq("user_id", userId)
        .neq("id", session.processing_job_id)
        .in("status", ACTIVE_PROCESSING_STATUSES)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("docbot_upload_files")
        .select("id, object_key")
        .eq("upload_id", session.upload_id)
        .eq("user_id", userId)
        .eq("kind", "audio")
        .eq("status", "uploaded")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

  if (otherSessionResult.error) {
    throw new Error("Unable to check whether the session audio is shared.", {
      cause: otherSessionResult.error,
    })
  }

  if (activeJobResult.error) {
    throw new Error("Unable to check active audio processing jobs.", {
      cause: activeJobResult.error,
    })
  }

  if (audioFileResult.error) {
    throw new Error("Unable to load the session audio metadata.", {
      cause: audioFileResult.error,
    })
  }

  const audioFile = audioFileResult.data
  const isAudioStillInUse = Boolean(
    otherSessionResult.data || activeJobResult.data
  )

  if (audioFile && !isAudioStillInUse) {
    await deleteR2Object(audioFile.object_key)

    const { data: deletedAudioMetadata, error: audioMetadataError } =
      await supabase
        .from("docbot_upload_files")
        .update({ status: "deleted" })
        .eq("id", audioFile.id)
        .eq("upload_id", session.upload_id)
        .eq("user_id", userId)
        .eq("status", "uploaded")
        .select("id")
        .maybeSingle()

    if (audioMetadataError || !deletedAudioMetadata) {
      throw new Error("Unable to mark the session audio as deleted.", {
        cause: audioMetadataError ?? undefined,
      })
    }
  }

  const { data, error } = await supabase
    .from("docbot_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new Error("Unable to delete the DocBot session.", { cause: error })
  }

  return Boolean(data)
}

function toDocBotSessionSummary(session: {
  created_at: string
  id: string
  last_activity_at: string
  processing_job_id: string
  title: string
  upload_id: string
}): DocBotSessionSummary {
  return {
    createdAt: session.created_at,
    id: session.id,
    lastActivityAt: session.last_activity_at,
    processingJobId: session.processing_job_id,
    tags: [],
    title: session.title,
    uploadId: session.upload_id,
  }
}

async function attachSessionTags(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessions: DocBotSessionSummary[]
) {
  if (sessions.length === 0) return sessions

  const sessionIds = sessions.map((session) => session.id)
  const { data: sessionTags, error: sessionTagsError } = await supabase
    .from("docbot_session_tags")
    .select("session_id, tag_id")
    .eq("user_id", userId)
    .in("session_id", sessionIds)
  if (sessionTagsError) {
    throw new Error("Unable to load DocBot session tags.", {
      cause: sessionTagsError,
    })
  }
  if (sessionTags.length === 0) return sessions

  const { data: tags, error: tagsError } = await supabase
    .from("docbot_tags")
    .select("id, name")
    .eq("user_id", userId)
    .in("id", [...new Set(sessionTags.map((entry) => entry.tag_id))])
  if (tagsError) {
    throw new Error("Unable to load DocBot tags.", { cause: tagsError })
  }

  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]))
  const tagsBySession = new Map<string, string[]>()
  for (const entry of sessionTags) {
    const name = tagNames.get(entry.tag_id)
    if (!name) continue
    const names = tagsBySession.get(entry.session_id) ?? []
    names.push(name)
    tagsBySession.set(entry.session_id, names)
  }

  return sessions.map((session) => ({
    ...session,
    tags: tagsBySession.get(session.id) ?? [],
  }))
}
