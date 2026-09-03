import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { analyzeTemplateVersion } from "@/lib/templates/server"

export const runtime = "nodejs"
export const maxDuration = 300

const paramsSchema = z.object({ templateId: z.string().uuid() })

export async function POST(
  _request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  try {
    const { templateId } = paramsSchema.parse(await context.params)
    const result = await analyzeTemplateVersion({
      supabase,
      templateId,
      userId: claims.sub,
    })
    return Response.json({ ...result, status: "ready" })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[api/templates/analyze] failed", {
      message,
      userId: claims.sub,
    })
    const isNotFound = message === "Template not found."
    return Response.json(
      {
        error: isNotFound
          ? message
          : "The DOCX could not be converted into a reusable template.",
      },
      { status: isNotFound ? 404 : 422 }
    )
  }
}
