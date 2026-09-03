import { z } from "zod"

import { DOCX_MIME_TYPE } from "@/lib/historia-clinica-docx"
import { downloadR2Object } from "@/lib/r2-storage"
import { getCurrentDocBotReport } from "@/lib/reports/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const sessionIdSchema = z.string().uuid()

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const parsedSessionId = sessionIdSchema.safeParse((await params).sessionId)
  if (!parsedSessionId.success) {
    return Response.json({ error: "Document not found." }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  try {
    const report = await getCurrentDocBotReport(
      supabase,
      claims.sub,
      parsedSessionId.data
    )
    if (!report) {
      return Response.json({ error: "Document not found." }, { status: 404 })
    }

    const document = await downloadR2Object(report.documentObjectKey)
    const encodedFileName = encodeURIComponent(report.documentFileName)

    return new Response(new Uint8Array(document.body), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="historia-clinica.docx"; filename*=UTF-8''${encodedFileName}`,
        "Content-Length": String(document.body.byteLength),
        "Content-Type": document.contentType || DOCX_MIME_TYPE,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("[api/sessions/document] failed", {
      message: error instanceof Error ? error.message : String(error),
      sessionId: parsedSessionId.data,
    })

    return Response.json(
      { error: "The document could not be downloaded." },
      { status: 500 }
    )
  }
}
