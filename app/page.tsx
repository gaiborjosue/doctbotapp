import { redirect } from "next/navigation"

import { DocBotProfileProvider } from "@/components/docbot-profile-provider"
import { RecordingScreen } from "@/components/recording-screen"
import { normalizeDocBotProfile } from "@/lib/docbot-profile"
import {
  DEFAULT_DOCBOT_CHAT_MODEL_ID,
  MERCURY_CHAT_MODEL_ID,
  type DocBotChatModelId,
} from "@/lib/chat/models"
import { getDocBotSessionSummaries } from "@/lib/sessions/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims

  if (error || !claims) redirect("/login")

  const email = typeof claims.email === "string" ? claims.email : ""
  const metadata = claims.user_metadata
  const metadataName =
    metadata && typeof metadata === "object" && "full_name" in metadata
      ? metadata.full_name
      : undefined
  const name =
    typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : email.split("@")[0] || "DocBot user"

  const loadProfile = () =>
    supabase
      .from("docbot_profiles")
      .select("username, avatar_id, avatar_colors")
      .eq("user_id", claims.sub)
      .maybeSingle()

  const [initialProfileResult, initialSessions] = await Promise.all([
    loadProfile(),
    getDocBotSessionSummaries(supabase, claims.sub),
  ])
  let profileResult = initialProfileResult

  if (profileResult.status === 401) {
    const { data: retryData, error: retryError } =
      await supabase.auth.getClaims()

    if (
      retryError ||
      !retryData?.claims ||
      retryData.claims.sub !== claims.sub
    ) {
      redirect("/login")
    }

    profileResult = await loadProfile()
  }

  const { data: profileRow, error: profileError } = profileResult

  if (profileError) {
    throw new Error("Unable to load the DocBot profile.", {
      cause: profileError,
    })
  }

  const initialProfile = normalizeDocBotProfile(
    profileRow
      ? {
          avatarId: profileRow.avatar_id,
          avatarColors: profileRow.avatar_colors,
          username: profileRow.username,
        }
      : undefined,
    name
  )
  const availableChatModelIds: DocBotChatModelId[] = [
    DEFAULT_DOCBOT_CHAT_MODEL_ID,
  ]
  if (process.env.INCEPTION_API_KEY?.trim()) {
    availableChatModelIds.push(MERCURY_CHAT_MODEL_ID)
  }

  return (
    <DocBotProfileProvider
      key={claims.sub}
      userId={claims.sub}
      initialProfile={initialProfile}
      hasRemoteProfile={Boolean(profileRow)}
    >
      <RecordingScreen
        availableChatModelIds={availableChatModelIds}
        initialSessions={initialSessions}
        user={{
          id: claims.sub,
          email,
          name: initialProfile.username || name,
        }}
      />
    </DocBotProfileProvider>
  )
}
