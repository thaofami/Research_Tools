declare global {
  interface Window {
    __PORTAL_BASE_PATH__?: string
  }
}

let cached: { basePath: string; embedPath: string } | null = null

export function loadEmbedConfig(): Promise<{ basePath: string; embedPath: string } | null> {
  if (cached) return Promise.resolve(cached)
  if (typeof window === "undefined") return Promise.resolve(null)
  return fetch("embed-config.json", { credentials: "omit" })
    .then((r) => (r.ok ? r.json() : null))
    .then((config: { basePath?: string; embedPath?: string } | null) => {
      if (config?.basePath !== undefined) {
        cached = {
          basePath: String(config.basePath ?? "").replace(/\/+$/, ""),
          embedPath: config.embedPath ? String(config.embedPath).replace(/\/+$/, "") : "",
        }
        if (cached.basePath && !window.__PORTAL_BASE_PATH__) {
          window.__PORTAL_BASE_PATH__ = cached.basePath
        }
        return cached
      }
      return null
    })
    .catch(() => null)
}
