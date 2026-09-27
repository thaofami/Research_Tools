import { createServer } from "node:http"
import { pathToFileURL } from "node:url"

const PORT = Number(process.env.PORT || 4270)
const RUNTIME_TARGET = String(process.env.PLAGIARISM_CHECKER_RUNTIME || "local").trim().toLowerCase()
const IS_PORTAL_RUNTIME = RUNTIME_TARGET === "portal"
const DEFAULT_LOCAL_UPSTREAM = "https://daovan.neu.edu.vn/api/file-search/ai"
const DEFAULT_PORTAL_UPSTREAM = "http://10.2.13.53:8002/api/file-search/ai"
const UPSTREAM_METADATA_PATH = String(process.env.PLAGIARISM_CHECKER_UPSTREAM_METADATA_PATH || "/metadata")
const UPSTREAM_AUTH_USER = String(process.env.PLAGIARISM_CHECKER_UPSTREAM_USER || "thaop@neu.edu.vn")
const UPSTREAM_AUTH_PASS = String(process.env.PLAGIARISM_CHECKER_UPSTREAM_PASS || "thaop123@")
const UPSTREAM_BASE = String(process.env.PLAGIARISM_CHECKER_UPSTREAM_URL || (IS_PORTAL_RUNTIME ? DEFAULT_PORTAL_UPSTREAM : DEFAULT_LOCAL_UPSTREAM)).replace(
  /\/+$/,
  "",
)
const ALT_UPSTREAM = UPSTREAM_BASE.includes("daovan.neu.edu.vn")
  ? "http://10.2.13.53:8002/api/file-search/ai"
  : "https://daovan.neu.edu.vn/api/file-search/ai"
const PROXY_PREFIXES = [
  "/api/plagiarism-checker",
  "/api/apps/plagiarismchecker",
  "/api/apps/plagiarism-checker",
  "/plagiarism-api",
]

function getUpstreamAuthHeader() {
  if (!UPSTREAM_AUTH_USER || !UPSTREAM_AUTH_PASS) return ""
  const token = Buffer.from(`${UPSTREAM_AUTH_USER}:${UPSTREAM_AUTH_PASS}`, "utf-8").toString("base64")
  return `Basic ${token}`
}

function applyCors(req, res) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : ""
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
    res.setHeader("Access-Control-Allow-Credentials", "true")
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*")
  }
  const reqHeaders = typeof req.headers["access-control-request-headers"] === "string" ? req.headers["access-control-request-headers"] : ""
  res.setHeader("Access-Control-Allow-Headers", reqHeaders || "Content-Type, Authorization")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data)
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.end(body)
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

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

/** Ánh xạ route cũ /v1/* sang API file-search/ai. */
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

function createProxyServer() {
  return createServer(async (req, res) => {
    applyCors(req, res)
    if ((req.method || "GET").toUpperCase() === "OPTIONS") {
      res.statusCode = 204
      res.end()
      return
    }

    const requestUrl = new URL(req.url || "/", "http://localhost")
    const method = (req.method || "GET").toUpperCase()
    const pathname = normalizeProxyPath(requestUrl.pathname)

    if (pathname === "/") {
      sendJson(res, 200, {
        success: true,
        service: "plagiarism-checker-backend-proxy",
        upstream: UPSTREAM_BASE,
        health: "/health",
        routes: [
          "/plagiarism-api/ask",
          "/plagiarism-api/tasks/*",
          "/plagiarism-api/session",
          "/plagiarism-api/metadata",
          "/plagiarism-api/v1/review (alias → /ask)",
          "/plagiarism-api/v1/task/:id (alias → /tasks/:id)",
          "/plagiarism-api/v1/task/:id/report (→ /tasks/:id/report)",
          "/plagiarism-api/v1/session (alias → /session)",
        ],
      })
      return
    }

    if (pathname === "/health" && method === "GET") {
      try {
        const authHeader = getUpstreamAuthHeader()
        const { response: upstreamRes, upstream } = await fetchFromUpstream(UPSTREAM_METADATA_PATH, {
          headers: authHeader ? { Authorization: authHeader } : undefined,
        })
        sendJson(res, 200, {
          ok: upstreamRes.ok,
          upstream,
          docs: `${upstream}${UPSTREAM_METADATA_PATH}`,
          upstream_http_status: upstreamRes.status,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "health check failed"
        sendJson(res, 200, { ok: false, upstream: UPSTREAM_BASE, message })
      }
      return
    }

    if (!isProxiedApiPath(pathname)) {
      sendJson(res, 404, { success: false, message: "Not Found. Dùng /ask, /tasks/:id, /session, /metadata (hoặc alias /v1/*)." })
      return
    }

    try {
      const headers = new Headers()
      Object.entries(req.headers).forEach(([key, value]) => {
        if (!value) return
        const lower = key.toLowerCase()
        if (lower === "host" || lower === "connection" || lower === "content-length" || lower === "authorization") return
        if (Array.isArray(value)) value.forEach((item) => headers.append(key, item))
        else headers.set(key, value)
      })
      const authHeader = getUpstreamAuthHeader()
      if (authHeader) headers.set("authorization", authHeader)

      const mappedPath = mapLegacyProxyPath(pathname)
      const bodyBuffer = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req)
      const { response: upstreamRes, upstream } = await fetchFromUpstream(`${mappedPath}${requestUrl.search}`, {
        method,
        headers,
        body: bodyBuffer && bodyBuffer.length > 0 ? bodyBuffer : undefined,
      })

      res.statusCode = upstreamRes.status
      upstreamRes.headers.forEach((value, key) => {
        const lower = key.toLowerCase()
        if (lower === "transfer-encoding" || lower === "connection" || lower === "content-length") return
        res.setHeader(key, value)
      })
      const responseBuffer = Buffer.from(await upstreamRes.arrayBuffer())
      res.setHeader("x-proxy-upstream", upstream)
      res.end(responseBuffer)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Proxy request failed"
      sendJson(res, 502, { success: false, message, upstream: UPSTREAM_BASE })
    }
  })
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  return import.meta.url === pathToFileURL(process.argv[1]).href
}

export function startStandaloneServer() {
  const server = createProxyServer()
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[plagiarism-checker-backend] listening on :${PORT}, proxy -> ${UPSTREAM_BASE}`)
  })
  return server
}

if (isDirectExecution()) {
  startStandaloneServer()
}
