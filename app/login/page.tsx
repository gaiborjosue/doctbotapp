import { redirect } from "next/navigation"

import { AuthForm } from "@/components/auth-form"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [supabase, query] = await Promise.all([createClient(), searchParams])
  const { data } = await supabase.auth.getClaims()

  if (data?.claims) redirect("/")

  return <AuthForm confirmationFailed={query.error === "confirmation_failed"} />
}
