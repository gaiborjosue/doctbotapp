import { z } from "zod"

import {
  createSourceSummaryMessage,
  getAllDocBotSessionMessages,
  getDocBotSessionContext,
} from "@/lib/chat/server"
import { createClient } from "@/lib/supabase/server"

const sessionIdSchema = z.string().uuid()

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const parsedSessionId = sessionIdSchema.safeParse((await params).sessionId)
  if (!parsedSessionId.success) {
    return Response.json({ error: "Session not found." }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  try {
    const context = await getDocBotSessionContext(
      supabase,
      claims.sub,
      parsedSessionId.data
    )
    if (!context) {
      return Response.json({ error: "Session not found." }, { status: 404 })
    }

    const storedMessages = await getAllDocBotSessionMessages(
      supabase,
      claims.sub,
      context.sessionId
    )

    return Response.json(
      {
        documentRevisionNumber: context.documentRevisionNumber,
        messages: [
          createSourceSummaryMessage(context),
          ...storedMessages.map(({ message }) => message),
        ],
      },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    console.error("[api/sessions/conversation] failed", {
      message: error instanceof Error ? error.message : String(error),
      sessionId: parsedSessionId.data,
    })

    return Response.json(
      { error: "The conversation could not be loaded." },
      { status: 500 }
    )
  }
}
