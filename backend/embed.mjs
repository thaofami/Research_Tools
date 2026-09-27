import express from "express"

const DEFAULT_DEV_UPSTREAM = "https://daovan.neu.edu.vn/api/file-search/ai"
const DEFAULT_PROD_UPSTREAM = "http://10.2.13.53:8002/api/file-search/ai"
const UPSTREAM_METADATA_PATH = String(process.env.PLAGIARISM_CHECKER_UPSTREAM_METADATA_PATH || "/metadata")
const UPSTREAM_AUTH_USER = String(process.env.PLAGIARISM_CHECKER_UPSTREAM_USER || "thaop@neu.edu.vn")
const UPSTREAM_AUTH_PASS = String(process.env.PLAGIARISM_CHECKER_UPSTREAM_PASS || "thaop123@")
const inferredDefaultUpstream = process.env.NODE_ENV === "development" ? DEFAULT_DEV_UPSTREAM : DEFAULT_PROD_UPSTREAM
const UPSTREAM_BASE = String(process.env.PLAGIARISM_CHECKER_UPSTREAM_URL || inferredDefaultUpstream).replace(/\/+$/, "")
const ALT_UPSTREAM = UPSTREAM_BASE.includes("daovan.neu.edu.vn")
  ? "http://10.2.13.53:8002/api/file-search/ai"
  : "https://daovan.neu.edu.vn/api/file-search/ai"
const PROXY_PREFIXES = ["/api/plagiarism-checker", "/api/apps/plagiarismchecker", "/api/apps/plagiarism-checker", "/plagiarism-api"]

function getUpstreamAuthHeader() {
  if (!UPSTREAM_AUTH_USER || !UPSTREAM_AUTH_PASS) return ""
  const token = Buffer.from(`${UPSTREAM_AUTH_USER}:${UPSTREAM_AUTH_PASS}`, "utf-8").toString("base64")
  return `Basic ${token}`
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchFromUpstream(pathnameWithQuery, init = {}) {
  const candidates = process.env.PLAGIARISM_CHECKER_UPSTREAM_URL ? [UPSTREAM_BASE] : [UPSTREAM_BASE, ALT_UPSTREAM]
  let lastError = null
  for (const base of candidates) {
    try {
      const response = await fetchWithTimeout(`${base}${pathnameWithQuery}`, init)
      return { response, upstream: base }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Proxy request failed")
}

/**
 * Dưới AI Portal (`app.use("/api/apps", …)`), đôi khi `req.path` là `/plagiarismchecker/v1/review` thay vì `/v1/review`.
 * Không khớp PROXY_PREFIXES → 404. Bỏ segment alias trước khi chuẩn hóa.
 */
function stripOptionalMountAlias(pathname) {
  let p = (pathname || "/").split("?")[0].replace(/\/+$/, "") || "/"
  const aliases = ["/plagiarismchecker", "/plagiarism-checker"]
  for (const prefix of aliases) {
    if (p === prefix) return "/"
    if (p.startsWith(`${prefix}/`)) {
      const rest = p.slice(prefix.length)
      return (rest.startsWith("/") ? rest : `/${rest}`).replace(/\/+$/, "") || "/"
    }
  }
  return p
}

function normalizeProxyPath(pathname) {
  let p = stripOptionalMountAlias(pathname)
  if (p === "/" || p === "/health") return p
  for (const prefix of PROXY_PREFIXES) {
    if (p === prefix) return "/"
    if (p.startsWith(`${prefix}/`)) {
      const stripped = p.slice(prefix.length)
      const inner = stripped.startsWith("/") ? stripped : `/${stripped}`
      return mapLegacyProxyPath(inner)
    }
  }
  return p
}

function mapLegacyProxyPath(pathname) {
  if (pathname === "/v1/review" || pathname.startsWith("/v1/review?")) return pathname.replace(/^\/v1\/review/, "/ask")
  if (pathname === "/v1/session" || pathname.startsWith("/v1/session?")) return pathname.replace(/^\/v1\/session/, "/session")
  const report = pathname.match(/^\/v1\/task\/([^/?#]+)\/report(\?.*)?$/)
  if (report) return `/tasks/${report[1]}/report${report[2] || ""}`
  const m = pathname.match(/^\/v1\/task\/([^/?#]+)(\?.*)?$/)
  if (m) return `/tasks/${m[1]}${m[2] || ""}`
  return pathname
}

function isProxiedApiPath(pathname) {
  if (pathname === "/ask") return true
  if (pathname === "/metadata") return true
  if (pathname === "/session" || pathname.startsWith("/session?")) return true
  if (pathname.startsWith("/tasks/")) return true
  if (pathname.startsWith("/v1/")) return true
  return false
}

/**
 * Trên AI Portal, `req.originalUrl` giữ full path (`/api/apps/plagiarismchecker/v1/review`).
 * POST sau `express.json()` đôi khi `req.url`/`req.path` không còn khớp chuẩn → normalize sai → 404.
 */
function pathnameFromEmbedRequest(req) {
  const orig = typeof req.originalUrl === "string" ? req.originalUrl.split("?")[0] : ""
  if (orig) {
    const m = orig.match(/\/api\/apps\/[^/]+\/(.*)$/i)
    if (m && m[1]) {
      const tail = m[1].startsWith("/") ? m[1] : `/${m[1]}`
      return normalizeProxyPath(tail)
    }
  }
  const rawFromUrl = typeof req.url === "string" ? req.url.split("?")[0] : ""
  const pathInput = rawFromUrl !== "" && rawFromUrl !== undefined ? rawFromUrl : req.path || "/"
  return normalizeProxyPath(pathInput)
}

export function createEmbedRouter() {
  const router = express.Router({ mergeParams: true })
  router.use(express.raw({ type: () => true, limit: "50mb" }))

  router.get("/", (_req, res) => {
    res.json({
      success: true,
      service: "plagiarism-checker-embed-proxy",
      upstream: UPSTREAM_BASE,
      health: "/health",
      routes: ["/ask", "/tasks/*", "/tasks/*/report", "/session", "/metadata", "/v1/review → /ask", "/v1/task/:id → /tasks/:id", "/v1/session → /session"],
    })
  })

  router.get("/health", async (_req, res) => {
    try {
      const authHeader = getUpstreamAuthHeader()
      const { response: upstreamRes, upstream } = await fetchFromUpstream(UPSTREAM_METADATA_PATH, {
        method: "GET",
        headers: authHeader ? { Authorization: authHeader } : undefined,
      })
      res.status(200).json({
        ok: upstreamRes.ok,
        upstream,
        docs: `${upstream}${UPSTREAM_METADATA_PATH}`,
        upstream_http_status: upstreamRes.status,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "health check failed"
      res.status(200).json({ ok: false, upstream: UPSTREAM_BASE, message })
    }
  })

  router.use(async (req, res) => {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : ""
    const method = (req.method || "GET").toUpperCase()
    const normalizedPath = pathnameFromEmbedRequest(req)
    if (!isProxiedApiPath(normalizedPath)) {
      res.status(404).json({ success: false, message: "Not Found. Dùng /ask, /tasks/*, /session, /metadata." })
      return
    }
    const upstreamPath = mapLegacyProxyPath(normalizedPath)
    const headers = new Headers()
    Object.entries(req.headers).forEach(([key, value]) => {
      if (!value) return
      const lower = key.toLowerCase()
      if (lower === "host" || lower === "connection" || lower === "content-length" || lower === "authorization") return
      if (Array.isArray(value)) value.forEach((item) => headers.append(key, item))
      else headers.set(key, String(value))
    })
    const authHeader = getUpstreamAuthHeader()
    if (authHeader) headers.set("authorization", authHeader)

    let body
    if (method !== "GET" && method !== "HEAD") {
      if (Buffer.isBuffer(req.body)) body = req.body
      else if (typeof req.body === "string") body = req.body
      else if (req.body != null && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        body = JSON.stringify(req.body)
        if (!headers.has("content-type")) headers.set("content-type", "application/json")
      }
    }

    try {
      const { response: upstreamRes, upstream } = await fetchFromUpstream(`${upstreamPath}${query}`, { method, headers, body })
      res.status(upstreamRes.status)
      res.setHeader("x-proxy-upstream", upstream)
      upstreamRes.headers.forEach((value, key) => {
        const lower = key.toLowerCase()
        if (lower === "transfer-encoding" || lower === "connection" || lower === "content-length") return
        res.setHeader(key, value)
      })
      const payload = Buffer.from(await upstreamRes.arrayBuffer())
      res.send(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Proxy request failed"
      res.status(502).json({ success: false, message, upstream: UPSTREAM_BASE })
    }
  })

  return router
}

export default createEmbedRouter
