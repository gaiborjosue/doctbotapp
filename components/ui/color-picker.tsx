"use client"

import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { motion } from "motion/react"
import { useId, useMemo, useState, type PointerEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#71717a",
  "#f4f4f5",
  "#18181b",
] as const

type HsvColor = {
  hue: number
  saturation: number
  value: number
}

export function ColorPicker({
  className,
  color,
  label = "Choose color",
  onChange,
}: {
  className?: string
  color: string
  label?: string
  onChange: (color: string) => void
}) {
  const inputId = useId()
  const normalizedColor = normalizeHex(color) ?? "#000000"
  const hsv = useMemo(() => hexToHsv(normalizedColor), [normalizedColor])
  const [colorDraft, setColorDraft] = useState(() => ({
    source: normalizedColor,
    value: normalizedColor.toUpperCase(),
  }))
  const colorInput =
    colorDraft.source === normalizedColor
      ? colorDraft.value
      : normalizedColor.toUpperCase()

  function updateColor(next: HsvColor) {
    onChange(hsvToHex(next))
  }

  function updateSaturationAndValue(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const saturation = clamp(
      ((event.clientX - bounds.left) / bounds.width) * 100,
      0,
      100
    )
    const value = clamp(
      100 - ((event.clientY - bounds.top) / bounds.height) * 100,
      0,
      100
    )

    updateColor({ hue: hsv.hue, saturation, value })
  }

  function commitColorInput() {
    const nextColor = normalizeHex(colorInput)
    if (nextColor) {
      onChange(nextColor)
      setColorDraft({ source: nextColor, value: nextColor.toUpperCase() })
      return
    }

    setColorDraft({
      source: normalizedColor,
      value: normalizedColor.toUpperCase(),
    })
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={label}
            className={cn(
              "h-10 w-14 justify-between gap-1 px-1.5 sm:w-16",
              className
            )}
            type="button"
            variant="outline"
          />
        }
      >
        <span
          aria-hidden="true"
          className="size-6 rounded-full border border-foreground/10 shadow-sm"
          style={{ backgroundColor: normalizedColor }}
        />
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3 text-muted-foreground"
        />
      </PopoverTrigger>

      <PopoverContent align="center" className="w-64 gap-3 p-3" sideOffset={8}>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col gap-3"
          initial={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <div
            aria-label={`${label} saturation and brightness`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(hsv.saturation)}
            aria-valuetext={normalizedColor}
            className="relative h-36 w-full cursor-crosshair touch-none overflow-hidden rounded-lg"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              updateSaturationAndValue(event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                updateSaturationAndValue(event)
              }
            }}
            onKeyDown={(event) => {
              const increment = event.shiftKey ? 10 : 1
              const nextColor = { ...hsv }

              if (event.key === "ArrowLeft") {
                nextColor.saturation = clamp(hsv.saturation - increment, 0, 100)
              } else if (event.key === "ArrowRight") {
                nextColor.saturation = clamp(hsv.saturation + increment, 0, 100)
              } else if (event.key === "ArrowDown") {
                nextColor.value = clamp(hsv.value - increment, 0, 100)
              } else if (event.key === "ArrowUp") {
                nextColor.value = clamp(hsv.value + increment, 0, 100)
              } else {
                return
              }

              event.preventDefault()
              updateColor(nextColor)
            }}
            role="slider"
            style={{
              background: [
                "linear-gradient(to top, rgb(0 0 0), transparent)",
                "linear-gradient(to right, rgb(255 255 255), transparent)",
                `hsl(${hsv.hue} 100% 50%)`,
              ].join(", "),
            }}
            tabIndex={0}
          >
            <motion.span
              animate={{
                backgroundColor: normalizedColor,
                left: `${hsv.saturation}%`,
                top: `${100 - hsv.value}%`,
              }}
              aria-hidden="true"
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md ring-1 ring-foreground/35"
              transition={{ duration: 0.08, ease: "easeOut" }}
            />
          </div>

          <Label className="sr-only" htmlFor={`${inputId}-hue`}>
            {label} hue
          </Label>
          <input
            aria-label={`${label} hue`}
            className="h-3 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-sm [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-sm"
            id={`${inputId}-hue`}
            max={360}
            min={0}
            onChange={(event) =>
              updateColor({ ...hsv, hue: Number(event.currentTarget.value) })
            }
            style={{
              background:
                "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
            }}
            type="range"
            value={Math.round(hsv.hue)}
          />

          <div className="flex items-center gap-2">
            <Label className="sr-only" htmlFor={inputId}>
              {label} hex value
            </Label>
            <Input
              className="h-8 min-w-0 flex-1 font-mono text-xs uppercase"
              id={inputId}
              maxLength={7}
              onBlur={commitColorInput}
              onChange={(event) => {
                const nextValue = event.currentTarget.value
                setColorDraft({ source: normalizedColor, value: nextValue })
                const nextColor = normalizeHex(nextValue)
                if (nextColor) onChange(nextColor)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commitColorInput()
                }
                if (event.key === "Escape") {
                  setColorDraft({
                    source: normalizedColor,
                    value: normalizedColor.toUpperCase(),
                  })
                }
              }}
              placeholder="#000000"
              spellCheck={false}
              value={colorInput}
            />
            <motion.span
              animate={{ backgroundColor: normalizedColor }}
              aria-hidden="true"
              className="size-8 shrink-0 rounded-md border border-foreground/10 shadow-sm"
            />
          </div>

          <div
            aria-label={`${label} presets`}
            className="grid grid-cols-6 gap-2"
            role="group"
          >
            {COLOR_PRESETS.map((preset) => {
              const isSelected = preset === normalizedColor.toLowerCase()

              return (
                <motion.button
                  aria-label={`Use color ${preset}`}
                  aria-pressed={isSelected}
                  className="relative size-7 rounded-full border border-foreground/10 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  key={preset}
                  onClick={() => onChange(preset)}
                  style={{ backgroundColor: preset }}
                  type="button"
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.92 }}
                >
                  {isSelected ? (
                    <CheckIcon
                      aria-hidden="true"
                      className="absolute inset-0 m-auto size-3.5"
                      style={{ color: getContrastColor(preset) }}
                    />
                  ) : null}
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      </PopoverContent>
    </Popover>
  )
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizeHex(value: string) {
  const match = value.trim().match(/^#?([\da-f]{6})$/i)
  return match ? `#${match[1].toLowerCase()}` : null
}

function hexToHsv(hex: string): HsvColor {
  const value = Number.parseInt(hex.slice(1), 16)
  const red = ((value >> 16) & 255) / 255
  const green = ((value >> 8) & 255) / 255
  const blue = (value & 255) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  let hue = 0

  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6)
    if (maximum === green) hue = 60 * ((blue - red) / delta + 2)
    if (maximum === blue) hue = 60 * ((red - green) / delta + 4)
  }

  if (hue < 0) hue += 360

  return {
    hue,
    saturation: maximum === 0 ? 0 : (delta / maximum) * 100,
    value: maximum * 100,
  }
}

function hsvToHex({ hue, saturation, value }: HsvColor) {
  const normalizedSaturation = saturation / 100
  const normalizedValue = value / 100
  const chroma = normalizedValue * normalizedSaturation
  const hueSection = hue / 60
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1))
  const minimum = normalizedValue - chroma
  let red = 0
  let green = 0
  let blue = 0

  if (hueSection < 1) [red, green, blue] = [chroma, secondary, 0]
  else if (hueSection < 2) [red, green, blue] = [secondary, chroma, 0]
  else if (hueSection < 3) [red, green, blue] = [0, chroma, secondary]
  else if (hueSection < 4) [red, green, blue] = [0, secondary, chroma]
  else if (hueSection < 5) [red, green, blue] = [secondary, 0, chroma]
  else [red, green, blue] = [chroma, 0, secondary]

  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + minimum) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

function getContrastColor(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000

  return luminance > 150 ? "#18181b" : "#ffffff"
}
