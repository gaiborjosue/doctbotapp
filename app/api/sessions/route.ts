import { getDocBotSessionSummaries } from "@/lib/sessions/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }

  try {
    const view = new URL(request.url).searchParams.get("view") ?? "active"
    if (view !== "active" && view !== "archived") {
      return Response.json(
        { error: "The session history view is invalid." },
        { status: 400 }
      )
    }

    const sessions = await getDocBotSessionSummaries(
      supabase,
      claims.sub,
      undefined,
      view
    )

    return Response.json(
      { sessions },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    console.error("[api/sessions] failed", {
      message: error instanceof Error ? error.message : String(error),
    })

    return Response.json(
      { error: "The session history could not be loaded." },
      { status: 500 }
    )
  }
}
