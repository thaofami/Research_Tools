const PORTAL_THEME_STORAGE = "portal-embed-theme"
const PORTAL_STORAGE_KEY = "neu-ui-theme"

export type ResolvedTheme = "light" | "dark"

function resolveFromSystem(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function getPortalTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  const win = window as unknown as { __PORTAL_THEME__?: string }
  if (win.__PORTAL_THEME__ === "dark" || win.__PORTAL_THEME__ === "light") return win.__PORTAL_THEME__
  try {
    const params = new URLSearchParams(window.location.search)
    const q = params.get("theme")?.toLowerCase()
    if (q === "dark" || q === "light") return q
    const stored = localStorage.getItem(PORTAL_STORAGE_KEY)
    if (stored === "dark" || stored === "light") return stored
    if (stored === "system") return resolveFromSystem()
    const embedStored = localStorage.getItem(PORTAL_THEME_STORAGE)
    if (embedStored === "dark" || embedStored === "light") return embedStored
  } catch {
    // ignore
  }
  return resolveFromSystem()
}

function resolveThemeValue(value: unknown): ResolvedTheme | null {
  if (value === "dark" || value === "light") return value
  if (value === "system") return resolveFromSystem()
  return null
}

function parseThemeFromMessageData(data: unknown): ResolvedTheme | null {
  if (!data) return null
  if (typeof data === "string") return resolveThemeValue(data.toLowerCase())
  if (typeof data !== "object") return null
  const payload = data as {
    type?: string
    theme?: unknown
    mode?: unknown
    colorScheme?: unknown
    value?: unknown
    payload?: { theme?: unknown; mode?: unknown; colorScheme?: unknown; value?: unknown }
  }

  const direct =
    resolveThemeValue(payload.theme) ??
    resolveThemeValue(payload.mode) ??
    resolveThemeValue(payload.colorScheme) ??
    resolveThemeValue(payload.value)
  if (direct) return direct

  if (!payload.payload) return null
  return (
    resolveThemeValue(payload.payload.theme) ??
    resolveThemeValue(payload.payload.mode) ??
    resolveThemeValue(payload.payload.colorScheme) ??
    resolveThemeValue(payload.payload.value)
  )
}

function applyPortalTheme(value: ResolvedTheme): void {
  if (typeof document === "undefined") return
  document.documentElement.classList.remove("light", "dark")
  document.documentElement.classList.add(value)
  document.documentElement.style.colorScheme = value
  try {
    localStorage.setItem(PORTAL_THEME_STORAGE, value)
  } catch {
    // ignore
  }
}

export function initPortalTheme(): void {
  applyPortalTheme(getPortalTheme())
  if (typeof window === "undefined") return
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== PORTAL_STORAGE_KEY || !e.newValue) return
    const value = resolveThemeValue(e.newValue)
    if (value) applyPortalTheme(value)
  })
  window.addEventListener("message", (event: MessageEvent) => {
    const nextTheme = parseThemeFromMessageData(event.data)
    if (nextTheme) applyPortalTheme(nextTheme)
  })
}
