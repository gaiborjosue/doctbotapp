import type { Metadata } from "next"
import { Geist_Mono, IBM_Plex_Sans } from "next/font/google"
import Script from "next/script"

import "@bible-strong/avatar-react/styles.css"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "DocBot — Record or upload audio",
  description: "Record a conversation or upload audio to DocBot.",
}

const themeBootstrap = `
(function () {
  var theme = "system";

  try {
    var storedTheme = window.localStorage.getItem("theme");
    if (storedTheme === "dark" || storedTheme === "light" || storedTheme === "system") {
      theme = storedTheme;
    }
  } catch (_) {}

  var resolvedTheme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;

  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;
})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased",
        fontMono.variable,
        ibmPlexSans.variable
      )}
    >
      <body>
        <Script id="docbot-theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
