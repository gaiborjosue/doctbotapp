"use client"

import * as React from "react"

type ThemeProviderProps = {
  children: React.ReactNode
}

type ThemePreference = "dark" | "light" | "system"

const THEME_STORAGE_KEY = "theme"
const DARK_MODE_QUERY = "(prefers-color-scheme: dark)"

function readThemePreference(): ThemePreference {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

    if (
      storedTheme === "dark" ||
      storedTheme === "light" ||
      storedTheme === "system"
    ) {
      return storedTheme
    }
  } catch {
    // Storage can be unavailable in restrictive browser contexts.
  }

  return "system"
}

function resolveTheme(preference: ThemePreference): "dark" | "light" {
  if (preference !== "system") {
    return preference
  }

  return window.matchMedia(DARK_MODE_QUERY).matches ? "dark" : "light"
}

function applyTheme(theme: "dark" | "light") {
  const root = document.documentElement
  const transitionBlocker = document.createElement("style")

  transitionBlocker.textContent =
    "*,::before,::after{transition:none!important}"
  document.head.append(transitionBlocker)

  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme

  // Force the style change to settle before transitions are restored.
  window.getComputedStyle(transitionBlocker).getPropertyValue("opacity")
  window.setTimeout(() => transitionBlocker.remove(), 0)
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeProvider({ children }: ThemeProviderProps) {
  React.useEffect(() => {
    const colorScheme = window.matchMedia(DARK_MODE_QUERY)

    function synchronizeTheme() {
      applyTheme(resolveTheme(readThemePreference()))
    }

    function onColorSchemeChange() {
      if (readThemePreference() === "system") {
        synchronizeTheme()
      }
    }

    function onStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY) {
        synchronizeTheme()
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== "d" ||
        isTypingTarget(event.target)
      ) {
        return
      }

      const nextTheme = document.documentElement.classList.contains("dark")
        ? "light"
        : "dark"

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
      } catch {
        // Applying the theme still works when persistence is unavailable.
      }

      applyTheme(nextTheme)
    }

    synchronizeTheme()
    colorScheme.addEventListener("change", onColorSchemeChange)
    window.addEventListener("storage", onStorage)
    window.addEventListener("keydown", onKeyDown)

    return () => {
      colorScheme.removeEventListener("change", onColorSchemeChange)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  return children
}

export { ThemeProvider }
