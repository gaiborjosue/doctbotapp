"use client"

import {
  Avatar as RuntimeAvatar,
  type AvatarProps,
} from "@bible-strong/avatar-react"
import { CheckIcon, ChevronRightIcon, User2Icon } from "lucide-react"
import type { Variants } from "motion/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useId, useMemo, useState, type FormEvent } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  type DocBotProfile,
} from "@/lib/docbot-profile"
import {
  AVATAR_OPTIONS,
  createCustomizedDefinition,
  getAvatarColors,
  getAvatarOption,
  type AvatarColorOverrides,
  type AvatarColors,
  type AvatarDefinitionJson,
  type AvatarId,
} from "@/lib/avatars/registry"
import { cn } from "@/lib/utils"

const PREVIEW_ANIMATIONS = [
  "excited",
  "laughing",
  "curious",
  "thinking",
  "happy",
  "surprised",
  "suspicious",
  "playful",
  "proud",
  "sleeping",
] as const

const containerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { staggerChildren: 0.045, delayChildren: 0.04 },
  },
}

const thumbnailVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: "easeOut" },
  },
}

function avatarAuraRgb(hexColor: string) {
  const channels = hexColor
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16))

  if (!channels || channels.some(Number.isNaN)) return "161, 161, 170"

  return channels.join(", ")
}

function shuffledPreviewAnimations(seed: number) {
  const animations = [...PREVIEW_ANIMATIONS]
  let state = seed || 0x6d2b79f5

  for (let index = animations.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const swapIndex = state % (index + 1)
    ;[animations[index], animations[swapIndex]] = [
      animations[swapIndex],
      animations[index],
    ]
  }

  return animations
}

function CustomizedAvatarPreview({
  animation,
  ariaLabel,
  colors,
  definition,
  size,
}: {
  animation?: (typeof PREVIEW_ANIMATIONS)[number]
  ariaLabel: string
  colors: AvatarColors
  definition: AvatarDefinitionJson
  size: number | string
}) {
  const customizedDefinition = useMemo(
    () => createCustomizedDefinition(definition, colors.body, colors.eyes),
    [colors.body, colors.eyes, definition]
  )

  return (
    <RuntimeAvatar
      definition={customizedDefinition as AvatarProps["definition"]}
      {...(animation ? { animation } : { expression: "neutral" })}
      size={size}
      ariaLabel={ariaLabel}
    />
  )
}

export function AvatarPickerDialog({
  animationSeed,
  open,
  profile,
  onOpenChange,
  onSave,
}: {
  animationSeed: number
  open: boolean
  profile: DocBotProfile
  onOpenChange: (open: boolean) => void
  onSave: (profile: DocBotProfile) => Promise<void>
}) {
  const [selectedAvatarId, setSelectedAvatarId] = useState<AvatarId>(
    profile.avatarId
  )
  const [avatarColors, setAvatarColors] = useState<AvatarColorOverrides>(() =>
    structuredClone(profile.avatarColors)
  )
  const [username, setUsername] = useState(profile.username)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const usernameId = useId()
  const usernameErrorId = `${usernameId}-error`
  const shouldReduceMotion = useReducedMotion()
  const previewAnimations = useMemo(
    () => shuffledPreviewAnimations(animationSeed),
    [animationSeed]
  )
  const selectedAvatar = getAvatarOption(selectedAvatarId)
  const selectedColors = getAvatarColors(selectedAvatarId, avatarColors)
  const trimmedUsername = username.trim()
  const isValid = trimmedUsername.length >= MIN_USERNAME_LENGTH
  const showError = trimmedUsername.length > 0 && !isValid
  const auraRgb = avatarAuraRgb(selectedColors.body)

  function updateSelectedColor(channel: keyof AvatarColors, color: string) {
    setAvatarColors((currentColors) => ({
      ...currentColors,
      [selectedAvatarId]: {
        ...getAvatarColors(selectedAvatarId, currentColors),
        [channel]: color,
      },
    }))
  }

  function resetSelectedColors() {
    setAvatarColors((currentColors) => {
      const nextColors = { ...currentColors }
      delete nextColors[selectedAvatarId]
      return nextColors
    })
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid || isSaving) return

    setIsSaving(true)
    setSaveError(undefined)

    try {
      await onSave({
        avatarId: selectedAvatarId,
        avatarColors,
        username: trimmedUsername,
      })
      onOpenChange(false)
    } catch {
      setSaveError("DocBot could not save these changes. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-[400px] min-w-0 overflow-x-hidden overflow-y-auto p-4 sm:p-7">
        <form
          className="flex w-full min-w-0 flex-col gap-6"
          onSubmit={submitProfile}
        >
          <DialogHeader className="min-w-0 items-center gap-1 text-center">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Pick your DocBot
            </DialogTitle>
            <DialogDescription className="text-sm">
              Choose its look and tell DocBot what to call you.
            </DialogDescription>
          </DialogHeader>

          <div className="flex w-full min-w-0 flex-col items-center gap-4">
            <FieldGroup className="grid w-full grid-cols-[3.5rem_minmax(8rem,1fr)_3.5rem] items-center gap-y-2 sm:grid-cols-[4rem_minmax(10rem,1fr)_4rem]">
              <Field className="col-start-1 row-start-1 w-14 items-center gap-1 justify-self-start sm:w-16">
                <FieldLabel className="justify-center text-center text-[10px] text-muted-foreground">
                  Body
                </FieldLabel>
                <ColorPicker
                  color={selectedColors.body}
                  key={`${selectedAvatarId}-body`}
                  label="Choose avatar body color"
                  onChange={(color) => updateSelectedColor("body", color)}
                />
              </Field>

              <div className="relative col-start-2 row-start-1 size-32 justify-self-center sm:size-40">
                <motion.div
                  animate={{
                    backgroundColor: `rgba(${auraRgb}, 0.24)`,
                    boxShadow: `0 0 34px 14px rgba(${auraRgb}, 0.18), 0 18px 38px rgba(${auraRgb}, 0.2)`,
                  }}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-[14%] inset-y-[18%] rounded-[44%] blur-xl"
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.45, ease: "easeOut" }
                  }
                />

                <div className="relative flex size-full items-center justify-center overflow-hidden rounded-full">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={selectedAvatar.id}
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { duration: 0.2, ease: "easeOut" }
                      }
                    >
                      <CustomizedAvatarPreview
                        animation={shouldReduceMotion ? undefined : "playful"}
                        colors={selectedColors}
                        definition={selectedAvatar.definition}
                        size="92%"
                        ariaLabel={`${selectedAvatar.name} avatar preview`}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <Field className="col-start-3 row-start-1 w-14 items-center gap-1 justify-self-end sm:w-16">
                <FieldLabel className="justify-center text-center text-[10px] text-muted-foreground">
                  Eyes
                </FieldLabel>
                <ColorPicker
                  color={selectedColors.eyes}
                  key={`${selectedAvatarId}-eyes`}
                  label="Choose avatar eye color"
                  onChange={(color) => updateSelectedColor("eyes", color)}
                />
              </Field>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="col-start-2 row-start-2 h-7 justify-self-center px-2 text-[10px]"
                disabled={!avatarColors[selectedAvatarId]}
                onClick={resetSelectedColors}
              >
                Default
              </Button>
            </FieldGroup>

            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={selectedAvatar.id}
                className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 0.16, ease: "easeOut" }
                }
              >
                {selectedAvatar.name}
              </motion.span>
            </AnimatePresence>

            <motion.div
              className="flex w-full max-w-full min-w-0 gap-3 overflow-x-auto overscroll-x-contain px-1 pt-1 pb-2"
              initial="initial"
              animate="animate"
              variants={containerVariants}
              role="group"
              aria-label="Available DocBot avatars"
            >
              {AVATAR_OPTIONS.map((avatar, index) => {
                const isSelected = selectedAvatar.id === avatar.id
                const previewAnimation = previewAnimations[index]
                const colors = getAvatarColors(avatar.id, avatarColors)

                return (
                  <motion.button
                    key={avatar.id}
                    type="button"
                    aria-label={`Select ${avatar.name}`}
                    aria-pressed={isSelected}
                    className={cn(
                      "relative size-16 shrink-0 overflow-hidden rounded-xl border bg-muted/30 transition-[opacity,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
                      isSelected
                        ? "border-foreground/20 opacity-100 ring-2 ring-foreground/70 ring-offset-2 ring-offset-background"
                        : "border-border opacity-50 hover:opacity-100"
                    )}
                    onClick={() => setSelectedAvatarId(avatar.id)}
                    variants={thumbnailVariants}
                    whileHover={
                      shouldReduceMotion ? undefined : { scale: 1.06 }
                    }
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center">
                      <CustomizedAvatarPreview
                        animation={
                          shouldReduceMotion ? undefined : previewAnimation
                        }
                        colors={colors}
                        definition={avatar.definition}
                        size={58}
                        ariaLabel={`${avatar.name} avatar option`}
                      />
                    </span>
                    {isSelected ? (
                      <span className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <CheckIcon className="size-3" aria-hidden="true" />
                      </span>
                    ) : null}
                  </motion.button>
                )
              })}
            </motion.div>
          </div>

          <FieldGroup className="min-w-0 gap-4">
            <Field className="min-w-0" data-invalid={showError || undefined}>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor={usernameId}>Username</FieldLabel>
                <span
                  className={cn(
                    "text-xs tabular-nums transition-colors duration-200",
                    username.length >= 18
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                  )}
                >
                  {username.length}/{MAX_USERNAME_LENGTH}
                </span>
              </div>

              <InputGroup className="h-10 min-w-0">
                <InputGroupAddon>
                  <User2Icon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id={usernameId}
                  name="username"
                  autoComplete="username"
                  maxLength={MAX_USERNAME_LENGTH}
                  placeholder="your_username…"
                  spellCheck={false}
                  value={username}
                  aria-invalid={showError}
                  aria-describedby={showError ? usernameErrorId : undefined}
                  onChange={(event) => setUsername(event.currentTarget.value)}
                />
              </InputGroup>

              <AnimatePresence initial={false}>
                {showError ? (
                  <motion.div
                    key="username-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  >
                    <FieldError id={usernameErrorId}>
                      Username must be at least {MIN_USERNAME_LENGTH}{" "}
                      characters.
                    </FieldError>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </Field>

            <Button
              type="submit"
              className="h-10 w-full"
              size="lg"
              disabled={!isValid || isSaving}
            >
              {isSaving ? "Saving…" : "Save DocBot"}
              <ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
            </Button>

            {saveError ? (
              <FieldError role="alert" className="justify-center text-center">
                {saveError}
              </FieldError>
            ) : null}
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
