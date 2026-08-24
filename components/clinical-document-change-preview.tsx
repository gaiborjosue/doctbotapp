"use client"

import { ArrowDownIcon, ArrowRightIcon, FilePenLineIcon } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { Separator } from "@/components/ui/separator"

type ClinicalDocumentChange = {
  replacement: string
  replaceAll?: boolean
  search: string
}

export function ClinicalDocumentChangePreview({
  changes,
}: {
  changes: ClinicalDocumentChange[]
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section
      aria-label="Proposed document changes"
      className="overflow-hidden rounded-md border bg-background"
    >
      <header className="flex items-center gap-1.5 px-2 py-1.5">
        <FilePenLineIcon
          aria-hidden="true"
          className="size-3.5 text-muted-foreground"
        />
        <span className="text-[11px] font-medium">Proposed changes</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {changes.length}
        </span>
      </header>
      <Separator />

      <ol className="flex max-h-72 flex-col overflow-y-auto">
        {changes.map((change, index) => (
          <motion.li
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-1.5 p-2 [&+li]:border-t"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
            key={`${change.search}-${index}`}
            transition={{
              delay: shouldReduceMotion ? 0 : index * 0.035,
              duration: shouldReduceMotion ? 0 : 0.18,
              ease: "easeOut",
            }}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>Change {index + 1}</span>
              {change.replaceAll ? <span>All matches</span> : null}
            </div>

            <div className="grid min-w-0 gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-stretch">
              <ComparisonValue label="Current" value={change.search} />
              <ArrowDownIcon
                aria-hidden="true"
                className="mx-auto size-3 text-muted-foreground sm:hidden"
              />
              <ArrowRightIcon
                aria-hidden="true"
                className="my-auto hidden size-3 text-muted-foreground sm:block"
              />
              <ComparisonValue label="Proposed" value={change.replacement} />
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  )
}

function ComparisonValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l-2 bg-muted/35 px-2 py-1.5">
      <div className="mb-0.5 text-[9px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <p className="max-h-24 overflow-y-auto text-[11px] leading-relaxed break-words whitespace-pre-wrap">
        {value || "Empty"}
      </p>
    </div>
  )
}
