"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export type AuthActionState = {
  status: "idle" | "error" | "success"
  message?: string
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") ?? ""),
  }
}

function validateEmail(email: string) {
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return "Enter a valid email address."
  }
}

function validateNewPassword(password: string) {
  if (password.length < 8) {
    return "Password must contain at least 8 characters."
  }
}

async function getRequestOrigin() {
  const requestHeaders = await headers()
  const origin = requestHeaders.get("origin")
  if (origin) return origin

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http"

  return host ? `${protocol}://${host}` : "http://localhost:3000"
}

export async function signIn(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const { email, password } = readCredentials(formData)
  const emailError = validateEmail(email)
  if (emailError) return { status: "error", message: emailError }
  if (!password) return { status: "error", message: "Enter your password." }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return {
      status: "error",
      message:
        error.code === "invalid_credentials"
          ? "The email or password is incorrect."
          : error.message,
    }
  }

  redirect("/")
}

export async function signUp(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const { email, password } = readCredentials(formData)
  const name = String(formData.get("name") ?? "").trim()
  const emailError = validateEmail(email)
  const passwordError = validateNewPassword(password)

  if (name.length < 2) {
    return { status: "error", message: "Enter your name." }
  }
  if (emailError) return { status: "error", message: emailError }
  if (passwordError) return { status: "error", message: passwordError }

  const origin = await getRequestOrigin()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    return { status: "error", message: error.message }
  }

  if (data.session) redirect("/")

  return {
    status: "success",
    message: "Check your email to confirm your account, then sign in.",
  }
}

export async function signOut() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) redirect("/?auth_error=signout")
  redirect("/login")
}
