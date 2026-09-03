"use client"

import { useEffect, useRef, type HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

export type LiveWaveformProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean
  barColor?: string
  barGap?: number
  barHeight?: number
  barRadius?: number
  barWidth?: number
  deviceId?: string
  fadeEdges?: boolean
  fadeWidth?: number
  fftSize?: number
  height?: number | string
  historySize?: number
  mode?: "scrolling" | "static"
  onError?: (error: Error) => void
  onStreamEnd?: () => void
  onStreamReady?: (stream: MediaStream) => void
  processing?: boolean
  sensitivity?: number
  smoothingTimeConstant?: number
  stream?: MediaStream
  updateRate?: number
}

export function LiveWaveform({
  active = false,
  barColor,
  barGap = 1,
  barHeight: minimumBarHeight = 4,
  barRadius = 1.5,
  barWidth = 3,
  className,
  deviceId,
  fadeEdges = true,
  fadeWidth = 24,
  fftSize = 256,
  height = 64,
  historySize = 60,
  mode = "static",
  onError,
  onStreamEnd,
  onStreamReady,
  processing = false,
  sensitivity = 1,
  smoothingTimeConstant = 0.8,
  stream: providedStream,
  style,
  updateRate = 30,
  ...props
}: LiveWaveformProps) {
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<number[]>([])
  const staticBarsRef = useRef<number[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(container)
    resizeCanvas()

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!active) return

    let cancelled = false
    let activeStream: MediaStream | undefined
    let ownsStream = false

    async function connectAudio() {
      try {
        activeStream =
          providedStream ??
          (await navigator.mediaDevices.getUserMedia({
            audio: deviceId
              ? {
                  autoGainControl: true,
                  deviceId: { exact: deviceId },
                  echoCancellation: true,
                  noiseSuppression: true,
                }
              : {
                  autoGainControl: true,
                  echoCancellation: true,
                  noiseSuppression: true,
                },
          }))
        ownsStream = !providedStream

        if (cancelled) {
          if (ownsStream) {
            activeStream.getTracks().forEach((track) => track.stop())
          }
          return
        }

        const AudioContextConstructor =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext: typeof AudioContext
            }
          ).webkitAudioContext
        const audioContext = new AudioContextConstructor()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = fftSize
        analyser.smoothingTimeConstant = smoothingTimeConstant
        audioContext.createMediaStreamSource(activeStream).connect(analyser)

        analyserRef.current = analyser
        audioContextRef.current = audioContext
        historyRef.current = []
        staticBarsRef.current = []
        onStreamReady?.(activeStream)
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error
            : new Error("The microphone waveform could not start.")
        )
      }
    }

    void connectAudio()

    return () => {
      cancelled = true
      analyserRef.current = null
      const audioContext = audioContextRef.current
      audioContextRef.current = null
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close()
      }
      if (ownsStream && activeStream) {
        activeStream.getTracks().forEach((track) => track.stop())
      }
      onStreamEnd?.()
    }
  }, [
    active,
    deviceId,
    fftSize,
    onError,
    onStreamEnd,
    onStreamReady,
    providedStream,
    smoothingTimeConstant,
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    let animationFrame = 0
    let lastUpdate = 0
    let processingTime = 0

    const animate = (currentTime: number) => {
      const rect = canvas.getBoundingClientRect()
      const step = Math.max(1, barWidth + barGap)
      const barCount = Math.max(1, Math.floor(rect.width / step))

      if (
        active &&
        analyserRef.current &&
        currentTime - lastUpdate >= updateRate
      ) {
        lastUpdate = currentTime
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        const startFrequency = Math.floor(data.length * 0.05)
        const endFrequency = Math.max(
          startFrequency + 1,
          Math.floor(data.length * 0.4)
        )
        const relevantData = data.slice(startFrequency, endFrequency)

        if (mode === "static") {
          const bars = Array.from({ length: barCount }, (_, index) => {
            const centerDistance = Math.abs(index - (barCount - 1) / 2)
            const normalizedDistance =
              centerDistance / Math.max(1, (barCount - 1) / 2)
            const dataIndex = Math.min(
              relevantData.length - 1,
              Math.floor(normalizedDistance * relevantData.length)
            )
            const value = (relevantData[dataIndex] / 255) * sensitivity
            return Math.max(0.05, Math.min(1, value))
          })
          staticBarsRef.current = bars
        } else {
          const average =
            relevantData.reduce((sum, value) => sum + value, 0) /
            relevantData.length /
            255
          historyRef.current.push(
            Math.max(0.05, Math.min(1, average * sensitivity))
          )
          if (historyRef.current.length > historySize) {
            historyRef.current.shift()
          }
        }
      } else if (processing && !active) {
        processingTime += 0.035
        const processingBars = Array.from({ length: barCount }, (_, index) => {
          const position = (index - barCount / 2) / Math.max(1, barCount / 2)
          const centerWeight = 1 - Math.abs(position) * 0.42
          const wave =
            Math.sin(processingTime * 1.6 + position * 3) * 0.24 +
            Math.sin(processingTime * 0.85 - position * 2) * 0.18 +
            Math.cos(processingTime * 2.1 + position) * 0.12
          return Math.max(0.05, Math.min(1, (0.24 + wave) * centerWeight))
        })

        if (mode === "static") {
          staticBarsRef.current = processingBars
        } else {
          historyRef.current = processingBars
        }
      } else if (!active && !processing) {
        staticBarsRef.current = staticBarsRef.current.map((value) =>
          Math.max(0, value * 0.9 - 0.005)
        )
        historyRef.current = historyRef.current.map((value) =>
          Math.max(0, value * 0.9 - 0.005)
        )
      }

      context.clearRect(0, 0, rect.width, rect.height)
      const computedBarColor =
        barColor || getComputedStyle(canvas).color || "currentColor"
      const values =
        mode === "static" ? staticBarsRef.current : historyRef.current
      const centerY = rect.height / 2

      for (let index = 0; index < barCount; index += 1) {
        const valueIndex =
          mode === "scrolling" ? values.length - 1 - index : index
        const value = values[valueIndex]
        if (value === undefined || value <= 0.01) continue

        const x =
          mode === "scrolling" ? rect.width - (index + 1) * step : index * step
        const renderedHeight = Math.max(
          minimumBarHeight,
          value * rect.height * 0.8
        )
        const y = centerY - renderedHeight / 2
        context.fillStyle = computedBarColor
        context.globalAlpha = 0.35 + value * 0.65

        if (barRadius > 0) {
          context.beginPath()
          context.roundRect(x, y, barWidth, renderedHeight, barRadius)
          context.fill()
        } else {
          context.fillRect(x, y, barWidth, renderedHeight)
        }
      }

      if (fadeEdges && fadeWidth > 0 && rect.width > 0) {
        const gradient = context.createLinearGradient(0, 0, rect.width, 0)
        const fadePercent = Math.min(0.3, fadeWidth / rect.width)
        gradient.addColorStop(0, "rgba(255,255,255,1)")
        gradient.addColorStop(fadePercent, "rgba(255,255,255,0)")
        gradient.addColorStop(1 - fadePercent, "rgba(255,255,255,0)")
        gradient.addColorStop(1, "rgba(255,255,255,1)")
        context.globalCompositeOperation = "destination-out"
        context.fillStyle = gradient
        context.fillRect(0, 0, rect.width, rect.height)
        context.globalCompositeOperation = "source-over"
      }

      context.globalAlpha = 1
      animationFrame = window.requestAnimationFrame(animate)
    }

    animationFrame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [
    active,
    barColor,
    barGap,
    barRadius,
    barWidth,
    fadeEdges,
    fadeWidth,
    historySize,
    minimumBarHeight,
    mode,
    processing,
    sensitivity,
    updateRate,
  ])

  const heightStyle = typeof height === "number" ? `${height}px` : height

  return (
    <div
      aria-label={
        active
          ? "Live audio waveform"
          : processing
            ? "Processing dictated audio"
            : "Audio waveform idle"
      }
      className={cn("relative w-full", className)}
      ref={containerRef}
      role="img"
      style={{ ...style, height: heightStyle }}
      {...props}
    >
      {!active && !processing ? (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dotted border-muted-foreground/20" />
      ) : null}
      <canvas aria-hidden="true" className="block size-full" ref={canvasRef} />
    </div>
  )
}
