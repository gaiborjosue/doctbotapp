"use client"

import { CheckCircle2Icon, EyeIcon, EyeOffIcon } from "lucide-react"
import { useActionState, useState } from "react"

import { signIn, signUp, type AuthActionState } from "@/app/auth/actions"
import { Button } from "@/components/ui/button"
import { FlickeringGrid } from "@/components/ui/flickering-grid"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type AuthMode = "sign-in" | "sign-up"
const INITIAL_AUTH_STATE: AuthActionState = { status: "idle" }

export function AuthForm({ confirmationFailed = false }) {
  const [mode, setMode] = useState<AuthMode>("sign-in")
  const [showPassword, setShowPassword] = useState(false)
  const [signInState, signInAction, isSigningIn] = useActionState(
    signIn,
    INITIAL_AUTH_STATE
  )
  const [signUpState, signUpAction, isSigningUp] = useActionState(
    signUp,
    INITIAL_AUTH_STATE
  )
  const state = mode === "sign-in" ? signInState : signUpState
  const isPending = mode === "sign-in" ? isSigningIn : isSigningUp

  return (
    <main className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <FlickeringGrid
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_72%_62%_at_50%_48%,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.5)_48%,black_100%)]"
        color="var(--muted-foreground)"
        flickerChance={0.08}
        gridGap={8}
        maxOpacity={0.16}
        squareSize={3}
      />

      <section
        className="relative w-full max-w-sm"
        aria-labelledby="auth-title"
      >
        <div className="mb-8 text-center">
          <p className="mb-3 text-sm font-medium tracking-tight">DocBot</p>
          <h1 id="auth-title" className="text-xl font-semibold tracking-tight">
            {mode === "sign-in" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "sign-in"
              ? "Sign in to access your recordings and chats."
              : "Keep your recordings and DocBot sessions in sync."}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
            <button
              type="button"
              className={cn(
                "h-8 rounded-md text-xs font-medium transition-colors",
                mode === "sign-in"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                setMode("sign-in")
                setShowPassword(false)
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={cn(
                "h-8 rounded-md text-xs font-medium transition-colors",
                mode === "sign-up"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                setMode("sign-up")
                setShowPassword(false)
              }}
            >
              Create account
            </button>
          </div>

          <form action={mode === "sign-in" ? signInAction : signUpAction}>
            <div className="space-y-4">
              {mode === "sign-up" ? (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    minLength={2}
                    className="h-10 text-sm md:text-sm"
                    placeholder="Your name"
                    required
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="h-10 text-sm md:text-sm"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      mode === "sign-in" ? "current-password" : "new-password"
                    }
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    minLength={mode === "sign-up" ? 8 : undefined}
                    aria-describedby={
                      mode === "sign-up" ? "password-requirements" : undefined
                    }
                    className="h-10 pr-10 text-sm md:text-sm"
                    placeholder={
                      mode === "sign-in"
                        ? "Enter your password"
                        : "At least 8 characters"
                    }
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="size-4" aria-hidden="true" />
                    ) : (
                      <EyeIcon className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {mode === "sign-up" ? (
                  <p
                    id="password-requirements"
                    className="text-[0.6875rem] text-muted-foreground"
                  >
                    Use at least 8 characters.
                  </p>
                ) : null}
              </div>

              {confirmationFailed ? (
                <p className="text-xs text-destructive" role="alert">
                  That confirmation link is invalid or expired. Please try
                  signing up again.
                </p>
              ) : null}

              {state.message ? (
                <p
                  className={cn(
                    "flex items-start gap-2 text-xs/relaxed",
                    state.status === "success"
                      ? "text-foreground"
                      : "text-destructive"
                  )}
                  role={state.status === "error" ? "alert" : "status"}
                >
                  {state.status === "success" ? (
                    <CheckCircle2Icon
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span>{state.message}</span>
                </p>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="h-10 w-full text-sm"
                disabled={isPending}
              >
                {isPending ? <Spinner aria-hidden="true" /> : null}
                {isPending
                  ? mode === "sign-in"
                    ? "Signing in…"
                    : "Creating account…"
                  : mode === "sign-in"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}
