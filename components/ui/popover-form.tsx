"use client"

import { useEffect, useRef, type ReactNode, type RefObject } from "react"
import { ChevronUpIcon, LoaderIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import type { VariantProps } from "class-variance-authority"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type PopoverFormProps = {
  open: boolean
  setOpen: (open: boolean) => void
  openChild?: ReactNode
  successChild?: ReactNode
  showSuccess?: boolean
  width?: number | string
  collapsedWidth?: number | string
  height?: number | string
  align?: "start" | "center" | "end"
  showCloseButton?: boolean
  title: string
  triggerLabel?: string
  triggerIcon?: ReactNode
  onTrigger?: () => void
  disabled?: boolean
  className?: string
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"]
}

function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  handleOnClickOutside: (event: PointerEvent) => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return

    function listener(event: PointerEvent) {
      if (!ref.current || ref.current.contains(event.target as Node)) return
      handleOnClickOutside(event)
    }

    document.addEventListener("pointerdown", listener)
    return () => document.removeEventListener("pointerdown", listener)
  }, [active, handleOnClickOutside, ref])
}

function PopoverForm({
  open,
  setOpen,
  openChild,
  showSuccess = false,
  successChild,
  width = "100%",
  collapsedWidth = width,
  height = 192,
  align = "center",
  title,
  triggerLabel = title,
  triggerIcon,
  onTrigger,
  showCloseButton = false,
  disabled = false,
  className,
  triggerVariant = "outline",
}: PopoverFormProps) {
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false), open)

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, setOpen])

  return (
    <div className="relative flex w-full items-center justify-center">
      <motion.button
        type="button"
        onClick={onTrigger ?? (() => setOpen(true))}
        style={{ borderRadius: 8 }}
        className={cn(
          buttonVariants({ variant: triggerVariant, size: "lg" }),
          "h-11 w-full",
          className
        )}
        disabled={disabled || open}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {triggerIcon}
        <span>{triggerLabel}</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            ref={ref}
            className={cn(
              "absolute bottom-0 overflow-hidden border border-border bg-muted p-1 outline-none",
              align === "start" && "left-0",
              align === "center" && "left-1/2 -translate-x-1/2",
              align === "end" && "right-0"
            )}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={{
              collapsed: {
                width: collapsedWidth,
                height: 44,
                borderRadius: 8,
                backgroundColor: "var(--background)",
              },
              expanded: {
                width,
                height,
                borderRadius: 10,
                backgroundColor: "var(--muted)",
              },
            }}
            transition={{
              type: "spring",
              duration: 0.4,
              bounce: 0,
            }}
            role="dialog"
            aria-label={title}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {showSuccess ? (
                <motion.div
                  key="success"
                  className="flex h-full flex-col items-center justify-center"
                  initial={{ y: -32, opacity: 0, filter: "blur(4px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  transition={{
                    type: "spring",
                    duration: 0.4,
                    bounce: 0,
                  }}
                >
                  {successChild ?? <PopoverFormSuccess />}
                </motion.div>
              ) : (
                <motion.div
                  key="open-child"
                  className="h-full rounded-[10px] border bg-background"
                  variants={{
                    collapsed: {
                      y: 6,
                      opacity: 0,
                      filter: "blur(3px)",
                      transition: { duration: 0.1 },
                    },
                    expanded: {
                      y: 0,
                      opacity: 1,
                      filter: "blur(0px)",
                      transition: { delay: 0.08, duration: 0.2 },
                    },
                  }}
                >
                  {openChild}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.span
              className="absolute top-[17px] left-4 text-sm text-muted-foreground data-[success=true]:text-transparent"
              data-success={showSuccess}
              variants={{
                collapsed: {
                  y: 3,
                  opacity: 0,
                  transition: { duration: 0.08 },
                },
                expanded: {
                  y: 0,
                  opacity: showSuccess ? 0 : 1,
                  transition: { delay: 0.12, duration: 0.16 },
                },
              }}
              aria-hidden="true"
            >
              {title}
            </motion.span>

            {showCloseButton ? (
              <motion.div
                className="absolute -top-[5px] left-1/2 flex h-[26px] w-3 -translate-x-1/2 items-center justify-center"
                variants={{
                  collapsed: { opacity: 0, transition: { duration: 0.08 } },
                  expanded: {
                    opacity: 1,
                    transition: { delay: 0.12, duration: 0.16 },
                  },
                }}
              >
                <PopoverFormCutOutTopIcon />
                <button
                  type="button"
                  className="absolute -mt-1 flex h-1.5 w-2.5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <ChevronUpIcon className="size-3 text-muted-foreground/80" />
                </button>
              </motion.div>
            ) : null}

            <motion.div
              className="pointer-events-none absolute inset-1 flex items-center justify-center gap-1 rounded-md text-xs/relaxed font-medium [&_svg]:size-4 [&_svg]:shrink-0"
              variants={{
                collapsed: {
                  opacity: 1,
                  filter: "blur(0px)",
                  transition: { delay: 0.18, duration: 0.12 },
                },
                expanded: {
                  opacity: 0,
                  filter: "blur(2px)",
                  transition: { duration: 0.08 },
                },
              }}
              aria-hidden="true"
            >
              {triggerIcon}
              <span>{triggerLabel}</span>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function PopoverFormButton({
  loading,
  text = "Submit",
}: {
  loading: boolean
  text?: string
}) {
  return (
    <button
      type="submit"
      className="ml-auto flex h-6 w-26 items-center justify-center overflow-hidden rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm"
      disabled={loading}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`${loading}`}
          className="flex w-full items-center justify-center"
          initial={{ opacity: 0, y: -25 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 25 }}
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        >
          {loading ? (
            <LoaderIcon className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <span>{text}</span>
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

function PopoverFormSuccess({
  title = "Success",
  description = "Thank you for your submission",
}: {
  title?: string
  description?: string
}) {
  return (
    <>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        className="-mt-1 text-primary"
        aria-hidden="true"
      >
        <path
          d="M27.6 16C27.6 22.4065 22.4065 27.6 16 27.6C9.59352 27.6 4.40002 22.4065 4.40002 16C4.40002 9.5935 9.59352 4.40002 16 4.40002C22.4065 4.40002 27.6 9.5935 27.6 16Z"
          fill="currentColor"
          fillOpacity="0.16"
        />
        <path
          d="M12.1334 16.9667L15.0334 19.8667L19.8667 13.1M27.6 16C27.6 22.4065 22.4065 27.6 16 27.6C9.59352 27.6 4.40002 22.4065 4.40002 16C4.40002 9.5935 9.59352 4.40002 16 4.40002C22.4065 4.40002 27.6 9.5935 27.6 16Z"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h3 className="mt-2 mb-1 text-sm font-medium text-primary">{title}</h3>
      <p className="mx-auto max-w-xs text-center text-sm text-pretty text-muted-foreground">
        {description}
      </p>
    </>
  )
}

function PopoverFormSeparator({
  width = 352,
  height = 2,
}: {
  width?: number | string
  height?: number
}) {
  return (
    <svg
      className="absolute top-[-1px] right-0 left-0"
      width={width}
      height={height}
      viewBox="0 0 352 2"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 1H352" className="stroke-border" strokeDasharray="4 4" />
    </svg>
  )
}

function PopoverFormCutOutTopIcon({
  width = 44,
  height = 30,
}: {
  width?: number
  height?: number
}) {
  const aspectRatio = 6 / 12
  const finalWidth = Math.min(width, height / aspectRatio)
  const finalHeight = Math.min(height, width * aspectRatio)

  return (
    <svg
      width={finalWidth}
      height={finalHeight}
      viewBox="0 0 6 12"
      fill="none"
      className="mt-px rotate-90"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 2C2.76142 2 5 3.79086 5 6C5 8.20914 2.76142 10 0 10V2Z"
        className="fill-muted"
      />
      <path
        d="M1 12V10C3.20914 10 5 8.20914 5 6C5 3.79086 3.20914 2 1 2V0"
        className="stroke-border"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PopoverFormCutOutLeftIcon() {
  return (
    <svg
      width="6"
      height="12"
      viewBox="0 0 6 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0 2C2.76142 2 5 3.79086 5 6C5 8.20914 2.76142 10 0 10V2Z"
        className="fill-muted"
      />
      <path
        d="M1 12V10C3.20914 10 5 8.20914 5 6C5 3.79086 3.20914 2 1 2V0"
        className="stroke-border"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PopoverFormCutOutRightIcon() {
  return (
    <svg
      width="6"
      height="12"
      viewBox="0 0 6 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0 2C2.76142 2 5 3.79086 5 6C5 8.20914 2.76142 10 0 10V2Z"
        className="fill-muted"
      />
      <path
        d="M1 12V10C3.20914 10 5 8.20914 5 6C5 3.79086 3.20914 2 1 2V0"
        className="stroke-border"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export {
  PopoverForm,
  PopoverFormButton,
  PopoverFormCutOutLeftIcon,
  PopoverFormCutOutRightIcon,
  PopoverFormSeparator,
  PopoverFormSuccess,
}
