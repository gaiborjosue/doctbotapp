import { z } from "zod"

import { createR2PresignedGetUrl } from "@/lib/r2-storage"
import { createClient } from "@/lib/supabase/server"

const paramsSchema = z.object({ templateId: z.string().uuid() })

export async function GET(
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
    const { data: template, error: templateError } = await supabase
      .from("docbot_templates")
      .select("current_version_id")
      .eq("id", templateId)
      .eq("user_id", claims.sub)
      .maybeSingle()
    if (templateError) throw templateError
    if (!template?.current_version_id) {
      return Response.json({ error: "Template not found." }, { status: 404 })
    }

    const { data: version, error: versionError } = await supabase
      .from("docbot_template_versions")
      .select("sanitized_object_key")
      .eq("id", template.current_version_id)
      .eq("user_id", claims.sub)
      .maybeSingle()
    if (versionError) throw versionError
    if (!version?.sanitized_object_key) {
      return Response.json({ error: "Template not found." }, { status: 404 })
    }

    const { downloadUrl } = await createR2PresignedGetUrl(
      version.sanitized_object_key
    )
    return Response.redirect(downloadUrl, 307)
  } catch (error) {
    console.error("[api/templates/document] failed", {
      message: error instanceof Error ? error.message : String(error),
      userId: claims.sub,
    })
    return Response.json(
      { error: "The template could not be downloaded." },
      { status: 500 }
    )
  }
}
