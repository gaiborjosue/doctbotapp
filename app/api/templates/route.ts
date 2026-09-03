import { createClient } from "@/lib/supabase/server"
import { listTemplates } from "@/lib/templates/server"

export async function GET() {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  try {
    return Response.json({
      templates: await listTemplates(supabase, claims.sub),
    })
  } catch (error) {
    console.error("[api/templates] list failed", {
      message: error instanceof Error ? error.message : String(error),
      userId: claims.sub,
    })
    return Response.json(
      { error: "The templates could not be loaded." },
      { status: 500 }
    )
  }
}
