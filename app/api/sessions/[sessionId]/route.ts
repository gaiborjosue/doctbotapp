import { z } from "zod"

import {
  archiveDocBotSession,
  deleteDocBotSession,
  renameDocBotSession,
  unarchiveDocBotSession,
} from "@/lib/sessions/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const sessionIdSchema = z.string().uuid()
const sessionMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    title: z.string().trim().min(1).max(160),
  }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("unarchive") }),
])

async function getAuthenticatedRequestContext(
  params: Promise<{ sessionId: string }>
) {
  const parsedSessionId = sessionIdSchema.safeParse((await params).sessionId)
  if (!parsedSessionId.success) return { error: "not-found" as const }

  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) return { error: "unauthorized" as const }

  return {
    sessionId: parsedSessionId.data,
    supabase,
    userId: claims.sub,
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const context = await getAuthenticatedRequestContext(params)
  if ("error" in context) {
    return context.error === "unauthorized"
      ? Response.json({ error: "Authentication required." }, { status: 401 })
      : Response.json({ error: "Session not found." }, { status: 404 })
  }

  const parsedMutation = sessionMutationSchema.safeParse(
    await request.json().catch(() => undefined)
  )
  if (!parsedMutation.success) {
    return Response.json(
      { error: "The session change is invalid." },
      { status: 400 }
    )
  }

  try {
    if (parsedMutation.data.action === "rename") {
      const session = await renameDocBotSession(
        context.supabase,
        context.userId,
        context.sessionId,
        parsedMutation.data.title
      )
      if (!session) {
        return Response.json({ error: "Session not found." }, { status: 404 })
      }

      return Response.json(
        { session },
        { headers: { "Cache-Control": "private, no-store" } }
      )
    }

    const updated =
      parsedMutation.data.action === "archive"
        ? await archiveDocBotSession(
            context.supabase,
            context.userId,
            context.sessionId
          )
        : await unarchiveDocBotSession(
            context.supabase,
            context.userId,
            context.sessionId
          )
    if (!updated) {
      return Response.json({ error: "Session not found." }, { status: 404 })
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("[api/sessions/session] update failed", {
      message: error instanceof Error ? error.message : String(error),
      sessionId: context.sessionId,
    })
    return Response.json(
      { error: "The session could not be updated." },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const context = await getAuthenticatedRequestContext(params)
  if ("error" in context) {
    return context.error === "unauthorized"
      ? Response.json({ error: "Authentication required." }, { status: 401 })
      : Response.json({ error: "Session not found." }, { status: 404 })
  }

  try {
    const deleted = await deleteDocBotSession(
      context.supabase,
      context.userId,
      context.sessionId
    )
    if (!deleted) {
      return Response.json({ error: "Session not found." }, { status: 404 })
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("[api/sessions/session] delete failed", {
      message: error instanceof Error ? error.message : String(error),
      sessionId: context.sessionId,
    })
    return Response.json(
      { error: "The session could not be deleted." },
      { status: 500 }
    )
  }
}
