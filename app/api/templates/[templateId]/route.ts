import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import {
  activateTemplate,
  archiveTemplate,
  deleteTemplate,
} from "@/lib/templates/server"
import { activateTemplateSchema } from "@/lib/templates/validation"

const paramsSchema = z.object({ templateId: z.string().uuid() })
const requestSchema = z.discriminatedUnion("action", [
  activateTemplateSchema.extend({ action: z.literal("activate") }),
  z.object({ action: z.literal("archive") }),
])

export async function PATCH(
  request: Request,
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
    const payload = requestSchema.parse(await request.json())

    if (payload.action === "archive") {
      await archiveTemplate({ supabase, templateId, userId: claims.sub })
      return Response.json({ status: "archived", templateId })
    }

    const result = await activateTemplate({
      isDefault: payload.isDefault,
      supabase,
      tags: payload.tags,
      templateId,
      userId: claims.sub,
    })
    return Response.json({ ...result, status: "active" })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "The template update request is invalid." },
        { status: 400 }
      )
    }
    console.error("[api/templates/update] failed", {
      message: error instanceof Error ? error.message : String(error),
      userId: claims.sub,
    })
    return Response.json(
      { error: "The template could not be updated." },
      { status: 500 }
    )
  }
}

export async function DELETE(
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
    const result = await deleteTemplate({
      supabase,
      templateId,
      userId: claims.sub,
    })
    return Response.json({ ...result, status: "deleted" })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "The template identifier is invalid." },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === "Template not found.") {
      return Response.json({ error: error.message }, { status: 404 })
    }
    console.error("[api/templates/delete] failed", {
      message: error instanceof Error ? error.message : String(error),
      userId: claims.sub,
    })
    return Response.json(
      { error: "The template could not be deleted." },
      { status: 500 }
    )
  }
}
