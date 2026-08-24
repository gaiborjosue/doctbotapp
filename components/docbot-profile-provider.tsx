"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import {
  MIN_USERNAME_LENGTH,
  normalizeDocBotProfile,
  type DocBotProfile,
} from "@/lib/docbot-profile"
import { createClient } from "@/lib/supabase/client"

const LEGACY_PROFILE_STORAGE_KEY = "docbot-profile:v1"

type DocBotProfileContextValue = {
  profile: DocBotProfile
  saveProfile: (profile: DocBotProfile) => Promise<void>
}

const DocBotProfileContext = createContext<DocBotProfileContextValue | null>(
  null
)

function readLegacyProfile(fallbackUsername: string) {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY) ?? "null"
    ) as Partial<DocBotProfile> | null

    if (!value) return

    return normalizeDocBotProfile(value, fallbackUsername)
  } catch {
    return
  }
}

export function DocBotProfileProvider({
  children,
  hasRemoteProfile,
  initialProfile,
  userId,
}: {
  children: ReactNode
  hasRemoteProfile: boolean
  initialProfile: DocBotProfile
  userId: string
}) {
  const [profile, setProfile] = useState(() =>
    normalizeDocBotProfile(initialProfile)
  )
  const supabase = useMemo(() => createClient(), [])

  const saveProfile = useCallback(
    async (nextProfile: DocBotProfile) => {
      const normalizedProfile = normalizeDocBotProfile(nextProfile)

      if (normalizedProfile.username.length < MIN_USERNAME_LENGTH) {
        throw new Error(
          `Username must be at least ${MIN_USERNAME_LENGTH} characters.`
        )
      }

      const { error } = await supabase.from("docbot_profiles").upsert(
        {
          user_id: userId,
          username: normalizedProfile.username,
          avatar_id: normalizedProfile.avatarId,
          avatar_colors: normalizedProfile.avatarColors,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )

      if (error) throw error

      setProfile(normalizedProfile)
    },
    [supabase, userId]
  )

  useEffect(() => {
    if (hasRemoteProfile) return

    const legacyProfile = readLegacyProfile(initialProfile.username)
    if (!legacyProfile || legacyProfile.username.length < MIN_USERNAME_LENGTH) {
      return
    }

    const migrationTimer = window.setTimeout(() => {
      void saveProfile(legacyProfile)
        .then(() => {
          window.localStorage.removeItem(LEGACY_PROFILE_STORAGE_KEY)
        })
        .catch(() => {
          // Keep the legacy value available for a later migration attempt.
        })
    }, 0)

    return () => window.clearTimeout(migrationTimer)
  }, [hasRemoteProfile, initialProfile.username, saveProfile])

  const value = useMemo(
    () => ({ profile, saveProfile }),
    [profile, saveProfile]
  )

  return (
    <DocBotProfileContext.Provider value={value}>
      {children}
    </DocBotProfileContext.Provider>
  )
}

export function useDocBotProfile() {
  const context = useContext(DocBotProfileContext)

  if (!context) {
    throw new Error(
      "useDocBotProfile must be used within DocBotProfileProvider"
    )
  }

  return context
}
