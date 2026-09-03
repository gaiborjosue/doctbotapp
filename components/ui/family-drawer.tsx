"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import useMeasure from "react-use-measure"
import { Drawer } from "vaul"

import { cn } from "@/lib/utils"

type FamilyDrawerContextValue = {
  view: string
  setView: (view: string) => void
  opacityDuration: number
  elementRef: ReturnType<typeof useMeasure>[0]
  bounds: ReturnType<typeof useMeasure>[1]
}

const FamilyDrawerContext = createContext<FamilyDrawerContextValue | null>(null)

function useFamilyDrawer() {
  const context = useContext(FamilyDrawerContext)

  if (!context) {
    throw new Error(
      "FamilyDrawer components must be used within FamilyDrawerRoot"
    )
  }

  return context
}

type FamilyDrawerRootProps = {
  children: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  defaultView?: string
}

function FamilyDrawerRoot({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  defaultView = "default",
}: FamilyDrawerRootProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const [view, setView] = useState(defaultView)
  const [elementRef, bounds] = useMeasure()
  const isOpen = controlledOpen ?? internalOpen
  const opacityDuration = Math.min(Math.max(bounds.height / 1000, 0.15), 0.27)

  function handleOpenChange(open: boolean) {
    if (controlledOpen === undefined) setInternalOpen(open)
    if (!open) setView(defaultView)
    onOpenChange?.(open)
  }

  return (
    <FamilyDrawerContext.Provider
      value={{ view, setView, opacityDuration, elementRef, bounds }}
    >
      <Drawer.Root open={isOpen} onOpenChange={handleOpenChange}>
        {children}
      </Drawer.Root>
    </FamilyDrawerContext.Provider>
  )
}

function FamilyDrawerPortal({ children }: { children: ReactNode }) {
  return <Drawer.Portal>{children}</Drawer.Portal>
}

function FamilyDrawerOverlay({ className }: { className?: string }) {
  return (
    <Drawer.Overlay
      className={cn(
        "fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]",
        className
      )}
    />
  )
}

function FamilyDrawerContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { bounds } = useFamilyDrawer()

  return (
    <Drawer.Content asChild>
      <motion.div
        animate={{
          height: bounds.height,
          transition: { duration: 0.27, ease: [0.25, 1, 0.5, 1] },
        }}
        className={cn(
          "fixed inset-x-4 bottom-4 z-50 mx-auto max-h-[calc(100svh-2rem)] max-w-sm overflow-hidden rounded-3xl border bg-background shadow-xl outline-none",
          className
        )}
      >
        {children}
      </motion.div>
    </Drawer.Content>
  )
}

function FamilyDrawerAnimatedWrapper({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { elementRef } = useFamilyDrawer()

  return (
    <div ref={elementRef} className={cn("px-5 pt-3 pb-5", className)}>
      <div
        className="mx-auto mb-4 h-1 w-10 rounded-full bg-border"
        aria-hidden="true"
      />
      {children}
    </div>
  )
}

function FamilyDrawerAnimatedContent({ children }: { children: ReactNode }) {
  const { view, opacityDuration } = useFamilyDrawer()

  return (
    <AnimatePresence initial={false} mode="popLayout" custom={view}>
      <motion.div
        key={view}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{
          duration: opacityDuration,
          ease: [0.26, 0.08, 0.25, 1],
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

function FamilyDrawerClose({
  className,
  ariaLabel = "Close drawer",
}: {
  className?: string
  ariaLabel?: string
}) {
  return (
    <Drawer.Close asChild>
      <button
        type="button"
        className={cn(
          "absolute top-6 right-6 z-10 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
          className
        )}
        aria-label={ariaLabel}
        data-vaul-no-drag=""
      >
        <svg
          className="size-3"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 2l8 8M10 2l-8 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </Drawer.Close>
  )
}

function FamilyDrawerHeader({
  icon,
  title,
  description,
  className,
}: {
  icon: ReactNode
  title: string
  description: string
  className?: string
}) {
  return (
    <header className={cn("pr-10", className)}>
      {icon}
      <Drawer.Title className="mt-3 text-xl font-medium tracking-tight text-foreground">
        {title}
      </Drawer.Title>
      <Drawer.Description className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </Drawer.Description>
    </header>
  )
}

function FamilyDrawerButton({
  children,
  onClick,
  className,
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      onClick={onClick}
      disabled={disabled}
      data-vaul-no-drag=""
    >
      {children}
    </button>
  )
}

export {
  FamilyDrawerAnimatedContent,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerButton,
  FamilyDrawerClose,
  FamilyDrawerContent,
  FamilyDrawerHeader,
  FamilyDrawerOverlay,
  FamilyDrawerPortal,
  FamilyDrawerRoot,
  useFamilyDrawer,
}
