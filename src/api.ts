import type {
  BackendStatusResponse,
  CheckResponse,
  DaovanAskPayload,
  HealthResponse,
  NeuSessionTaskRow,
  NeuSessionTasksResponse,
  TaskResponse,
} from "./types"
import { getPortalUserFromWindow } from "./portal-user"
import { t } from "./i18n"

const DEV_PROXY_API_BASE = "/plagiarism-api"
const PROD_BACKEND_API_BASE = "/api/plagiarism-checker"
const rawApiBase = import.meta.env.VITE_PLAGIARISM_API_BASE?.trim()
const STORAGE_KEY_API_BASE = "plagiarismchecker.apiBase"
const STORAGE_KEY_USER_ID = "plagiarismchecker.userId"
const DEFAULT_UPSTREAM_LOCAL = "https://daovan.neu.edu.vn/api/file-search/ai"
const DEFAULT_UPSTREAM_PORTAL = "http://10.2.13.53:8002/api/file-search/ai"
const rawAssistantBase = import.meta.env.VITE_PLAGIARISM_ASSISTANT_BASE_URL?.trim()
const rawDefaultUserId = import.meta.env.VITE_PLAGIARISM_USER_ID?.trim()

function resolveApiBaseAlias(value: string): string {
  const raw = value.trim()
  const lowered = raw.toLowerCase()
  if (lowered === "backend" || lowered === "be") return import.meta.env.DEV ? DEV_PROXY_API_BASE : PROD_BACKEND_API_BASE
  return raw
}

function normalizeApiBase(value: string): string {
  const resolved = resolveApiBaseAlias(value).replace(/\/+$/, "")
  if (!resolved) return ""
  if (resolved.startsWith("/")) return resolved
  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(resolved)
      if (parsed.origin === window.location.origin) return parsed.pathname.replace(/\/+$/, "") || "/"
    } catch {
      // ignore invalid URL
    }
  }
  return import.meta.env.DEV ? DEV_PROXY_API_BASE : PROD_BACKEND_API_BASE
}

function getPortalApiBase(): string {
  if (typeof window === "undefined") return ""
  const w = window as { __WRITE_API_BASE__?: string; __PLAGIARISM_CHECKER_API_BASE__?: string }
  const fromApp = typeof w.__PLAGIARISM_CHECKER_API_BASE__ === "string" ? w.__PLAGIARISM_CHECKER_API_BASE__.trim() : ""
  if (fromApp) return fromApp.replace(/\/+$/, "")
  const fromPortal = typeof w.__WRITE_API_BASE__ === "string" ? w.__WRITE_API_BASE__.trim() : ""
  return fromPortal ? fromPortal.replace(/\/+$/, "") : ""
}

function isPortalEmbedRuntime(): boolean {
  if (typeof window === "undefined") return false
  const w = window as { __WRITE_API_BASE__?: string; __PORTAL_BASE_PATH__?: string; __PLAGIARISM_CHECKER_API_BASE__?: string }
  return Boolean(
    (typeof w.__WRITE_API_BASE__ === "string" && w.__WRITE_API_BASE__.trim()) ||
      (typeof w.__PORTAL_BASE_PATH__ === "string" && w.__PORTAL_BASE_PATH__.trim()) ||
      (typeof w.__PLAGIARISM_CHECKER_API_BASE__ === "string" && w.__PLAGIARISM_CHECKER_API_BASE__.trim()),
  )
}

function getApiBase(): string {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_API_BASE)?.trim()
      if (stored) return normalizeApiBase(stored)
    } catch {
      // ignore
    }
  }
  if (rawApiBase) return normalizeApiBase(rawApiBase)
  const fromPortal = getPortalApiBase()
  if (fromPortal) return normalizeApiBase(fromPortal)
  return import.meta.env.DEV ? DEV_PROXY_API_BASE : PROD_BACKEND_API_BASE
}

/**
 * research.neu.edu.vn chỉ ánh xếp `/…/api/apps/plagiarismchecker/v1/*` tới backend Node (có thể có basePath nhúng).
 * `/ask` trên cùng prefix sẽ 404 — phải dùng alias `/v1/review` (server.mjs chuyển tiếp sang /ask upstream).
 * Không áp dụng cho `/plagiarism-api` (dev proxy tới daovan).
 */
function pathLooksLikePlagiarismCheckerEmbedPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/"
  if (p === "/plagiarism-api" || p.startsWith("/plagiarism-api/")) return false
  const re =
    /(api\/apps\/plagiarismchecker|api\/apps\/plagiarism-checker|api\/plagiarism-checker)(\/|$)/u
  return re.test(p)
}

function pathnameOfApiBase(apiBase: string): string {
  const b = apiBase.trim().replace(/\/+$/, "")
  if (!b) return "/"
  if (b.startsWith("http://") || b.startsWith("https://")) {
    try {
      return new URL(b).pathname.replace(/\/+$/, "") || "/"
    } catch {
      return b
    }
  }
  if (typeof window !== "undefined") {
    try {
      return new URL(b.startsWith("/") ? b : `/${b}`, window.location.origin).pathname.replace(/\/+$/, "") || "/"
    } catch {
      return b.startsWith("/") ? b : `/${b}`
    }
  }
  return b.startsWith("/") ? b : `/${b}`
}

function usesEmbeddedBackendV1Routes(apiBase: string): boolean {
  return pathLooksLikePlagiarismCheckerEmbedPath(pathnameOfApiBase(apiBase))
}

function getAskEndpointPath(apiBase: string): string {
  return usesEmbeddedBackendV1Routes(apiBase) ? "/v1/review" : "/ask"
}

function getTaskEndpointPath(apiBase: string, taskId: string, userId: string): string {
  const id = encodeURIComponent(taskId.trim())
  const q = userId.trim() ? `?user_id=${encodeURIComponent(userId.trim())}` : ""
  return usesEmbeddedBackendV1Routes(apiBase) ? `/v1/task/${id}${q}` : `/tasks/${id}${q}`
}

function getSessionEndpointPath(apiBase: string, query: URLSearchParams): string {
  const qs = query.toString()
  const suffix = qs ? `?${qs}` : ""
  return usesEmbeddedBackendV1Routes(apiBase) ? `/v1/session${suffix}` : `/session${suffix}`
}

/** Tìm task theo `task_id` trong `meta.tasks` của GET /session. */
export function findNeuSessionTaskForId(tasks: NeuSessionTaskRow[] | undefined, taskId: string): NeuSessionTaskRow | null {
  const tid = taskId.trim()
  if (!tid || !tasks?.length) return null
  for (const t of tasks) {
    if (t && typeof t.task_id === "string" && t.task_id === tid) return t
  }
  return null
}

function getMetadataOrHealthPath(apiBase: string): string {
  return usesEmbeddedBackendV1Routes(apiBase) ? "/health" : "/metadata"
}

/** GET /metadata và /health không cần cookie trình duyệt; bỏ cookie tránh 431 (cookie phiên đăng nhập / localhost rất lớn). */
function isMetadataOrHealthRequestPath(path: string): boolean {
  const pathname = (path.trim().split("?")[0] || "/").replace(/\/+$/, "") || "/"
  return pathname === "/metadata" || pathname === "/health" || pathname.endsWith("/metadata") || pathname.endsWith("/health")
}

/** Dev proxy `/plagiarism-api` → upstream ngoài; cookie localhost thường rất lớn → 431 Request Header Fields Too Large. */
function isDevPlagiarismViteProxyBase(apiBase: string): boolean {
  if (!import.meta.env.DEV) return false
  const b = apiBase.trim().replace(/\/+$/, "") || "/"
  if (b === "/plagiarism-api" || b.startsWith("/plagiarism-api/")) return true
  if (typeof window === "undefined") return false
  try {
    const u = b.startsWith("http") ? new URL(b) : new URL(b, window.location.origin)
    if (u.origin !== window.location.origin) return false
    const p = u.pathname.replace(/\/+$/, "") || "/"
    return p === "/plagiarism-api" || p.startsWith("/plagiarism-api/")
  } catch {
    return false
  }
}

/**
 * - GET /metadata, /health: luôn omit cookie.
 * - Base nhúng (`/api/apps/plagiarismchecker`, …): omit mọi request — cookie phiên đăng nhập thường rất lớn → 431 Request Header Fields Too Large; user_id đã có trong body/query.
 * - `npm run dev` + `/plagiarism-api`: omit (proxy daovan không cần cookie localhost).
 * - Các base same-origin khác: same-origin.
 */
function plagiarismFetchCredentials(apiBase: string, requestPath = ""): RequestCredentials {
  if (typeof window === "undefined") return "omit"
  if (isMetadataOrHealthRequestPath(requestPath)) return "omit"
  if (isDevPlagiarismViteProxyBase(apiBase)) return "omit"
  if (usesEmbeddedBackendV1Routes(apiBase)) return "omit"
  try {
    const rp = requestPath.trim()
    const joined = `${apiBase.trim().replace(/\/+$/, "")}${rp.startsWith("/") ? "" : "/"}${rp}`
    const pathOnly = new URL(joined, window.location.origin).pathname
    if (pathLooksLikePlagiarismCheckerEmbedPath(pathOnly)) return "omit"
  } catch {
    // ignore
  }
  const b = apiBase.trim()
  if (b.startsWith("/")) return "same-origin"
  try {
    const u = b.startsWith("http") ? new URL(b) : new URL(b, window.location.origin)
    if (u.origin === window.location.origin) return "same-origin"
  } catch {
    // ignore
  }
  return "omit"
}

function getTaskReportPath(apiBase: string, taskId: string, queryWithoutQuestionMark: string): string {
  const id = encodeURIComponent(taskId.trim())
  const q = queryWithoutQuestionMark ? `?${queryWithoutQuestionMark}` : ""
  return usesEmbeddedBackendV1Routes(apiBase) ? `/v1/task/${id}/report${q}` : `/tasks/${id}/report${q}`
}

/** Base URL đưa vào field assistant_base_url (theo ví dụ trong tài liệu NEU). */
export function getAssistantBaseUrl(): string {
  if (rawAssistantBase) return rawAssistantBase.replace(/\/+$/, "")
  return isPortalEmbedRuntime() ? DEFAULT_UPSTREAM_PORTAL : DEFAULT_UPSTREAM_LOCAL
}

/** user_id: bắt buộc khi gọi application_type=app và khi GET task/session. */
export function getPlagiarismUserId(): string {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_USER_ID)?.trim()
      if (stored) return stored
    } catch {
      // ignore
    }
  }
  return rawDefaultUserId || "demo-user"
}

export function setPlagiarismUserId(value: string): void {
  if (typeof window === "undefined") return
  try {
    const t = value.trim()
    if (!t) localStorage.removeItem(STORAGE_KEY_USER_ID)
    else localStorage.setItem(STORAGE_KEY_USER_ID, t)
  } catch {
    // ignore
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 431) {
      throw new Error(t("api.error431"))
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(t("api.errorAuthRequired"))
    }
    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null
      throw new Error(body?.message || body?.error || t("api.requestFailedStatus", { status: response.status }))
    }
    const text = await response.text().catch(() => "")
    throw new Error(text || t("api.requestFailedStatus", { status: response.status }))
  }
  return (await response.json()) as T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase()
  return requestByBase<T>(base, path, init)
}

async function requestByBase<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    const { credentials: _c, ...rest } = init ?? {}
    response = await fetch(`${base}${path}`, {
      ...rest,
      credentials: plagiarismFetchCredentials(base, path),
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(t("api.cannotConnectBackend"))
    }
    throw error
  }
  return unwrap<T>(response)
}

export function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `session-${Date.now()}`
}

export function getResolvedApiBase(): string {
  return getApiBase()
}

/** Link kiểm tra API (metadata trên daovan, /health trên proxy research). */
export function getApiDocumentationUrl(): string {
  const b = getApiBase()
  return `${b}${getMetadataOrHealthPath(b)}`
}

export function getDefaultUpstreamApiBase(): string {
  return isPortalEmbedRuntime() ? DEFAULT_UPSTREAM_PORTAL : DEFAULT_UPSTREAM_LOCAL
}

export function setCustomApiBase(value: string): void {
  if (typeof window === "undefined") return
  try {
    const normalized = value.trim()
    if (!normalized) localStorage.removeItem(STORAGE_KEY_API_BASE)
    else localStorage.setItem(STORAGE_KEY_API_BASE, normalizeApiBase(normalized))
  } catch {
    // ignore
  }
}

export async function fetchBackendStatus(): Promise<BackendStatusResponse> {
  const base = getApiBase()
  const probe = getMetadataOrHealthPath(base)
  try {
    const meta = await requestByBase<Record<string, unknown>>(base, probe)
    return {
      success: true,
      service: usesEmbeddedBackendV1Routes(base) ? "plagiarism-checker-embed-proxy" : "plagiarism-daovan-api",
      name: typeof meta.name === "string" ? meta.name : undefined,
      version: typeof meta.version === "string" ? meta.version : undefined,
      upstream: base,
      health: probe,
      routes: usesEmbeddedBackendV1Routes(base)
        ? ["/v1/review", "/v1/task/{task_id}", "/v1/session", "/health"]
        : ["/ask", "/tasks/{task_id}", "/session", "/metadata"],
    }
  } catch {
  return request<BackendStatusResponse>("/")
  }
}

export async function fetchBackendStatusByBase(baseUrl: string): Promise<BackendStatusResponse> {
  const base = normalizeApiBase(baseUrl)
  if (!base) throw new Error(t("api.backendUrlNotConfigured"))
  const probe = getMetadataOrHealthPath(base)
  try {
    const meta = await requestByBase<Record<string, unknown>>(base, probe)
    return {
      success: true,
      service: usesEmbeddedBackendV1Routes(base) ? "plagiarism-checker-embed-proxy" : "plagiarism-daovan-api",
      name: typeof meta.name === "string" ? meta.name : undefined,
      version: typeof meta.version === "string" ? meta.version : undefined,
      upstream: base,
      health: probe,
      routes: usesEmbeddedBackendV1Routes(base)
        ? ["/v1/review", "/v1/task/{task_id}", "/v1/session", "/health"]
        : ["/ask", "/tasks/{task_id}", "/session", "/metadata"],
    }
  } catch {
  return requestByBase<BackendStatusResponse>(base, "/")
  }
}

export async function fetchUpstreamHealth(): Promise<HealthResponse> {
  const base = getApiBase()
  const probe = getMetadataOrHealthPath(base)
  try {
    const meta = await requestByBase<Record<string, unknown>>(base, probe)
    return {
      ok: true,
      upstream: base,
      docs: `${base}${probe}`,
      name: typeof meta.name === "string" ? meta.name : undefined,
      version: typeof meta.version === "string" ? meta.version : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      upstream: base,
      message: error instanceof Error ? error.message : "metadata failed",
    }
  }
}

export async function fetchUpstreamHealthByBase(baseUrl: string): Promise<HealthResponse> {
  const base = normalizeApiBase(baseUrl)
  if (!base) throw new Error(t("api.backendUrlNotConfigured"))
  const probe = getMetadataOrHealthPath(base)
  try {
    const meta = await requestByBase<Record<string, unknown>>(base, probe)
    return {
      ok: true,
      upstream: base,
      docs: `${base}${probe}`,
      name: typeof meta.name === "string" ? meta.name : undefined,
      version: typeof meta.version === "string" ? meta.version : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      upstream: base,
      message: error instanceof Error ? error.message : "metadata failed",
    }
  }
}

function sessionTitleFromPrompt(prompt: string): string {
  const t = prompt.replace(/\s+/g, " ").trim()
  if (!t) return "Kiểm tra đạo văn"
  return t.length > 120 ? `${t.slice(0, 117)}...` : t
}

/** Dựng body POST /ask theo tài liệu cấu hình NEU (chat đồng bộ vs app bất đồng bộ). */
export function buildDaovanAskPayload(options: {
  sessionId: string
  prompt: string
  applicationType: "chat" | "app"
  documents: Array<{ url: string; name: string }>
  modelId?: string
  /** Theo doc: tiêu đề phiên; nếu bỏ trống sẽ lấy từ prompt / tài liệu. */
  sessionTitle?: string
  /** Khi đã biết `user_id` chính xác (vd. vừa set trước khi gọi), tránh đọc localStorage chưa kịp cập nhật. */
  userIdForRequest?: string
  /** Email phụ nhận bản sao (chế độ app / gửi email); gửi trong `context.extra_data`. */
  additionalNotifyEmail?: string
}): DaovanAskPayload {
  const promptTrim = options.prompt.trim()
  /** Chỉ tài liệu, không có văn bản người dùng: không dùng câu mặc định kiểu chat trống; chỉ hướng dẫn xử lý file. */
  const resolvedPrompt =
    promptTrim !== ""
      ? promptTrim
      : options.documents.length > 0
        ? "Kiểm tra đạo văn cho các tài liệu đính kèm."
        : "Kiểm tra đạo văn."
  const userId = (options.userIdForRequest?.trim() || getPlagiarismUserId()).trim() || "demo-user"
  const addNotify = options.additionalNotifyEmail?.replace(/\s+/g, " ").trim() ?? ""
  const addNotifyNorm = addNotify.toLowerCase()
  const userIdNorm = userId.toLowerCase()
  const additionalNotifyEmail =
    addNotify && addNotify.includes("@") && addNotifyNorm !== userIdNorm ? addNotify : ""
  const titleCustom = options.sessionTitle?.replace(/\s+/g, " ").trim()
  const session_title = titleCustom
    ? titleCustom.length > 200
      ? `${titleCustom.slice(0, 197)}...`
      : titleCustom
    : sessionTitleFromPrompt(
        promptTrim || (options.documents.length ? "Kiểm tra tài liệu đính kèm" : "Kiểm tra đạo văn"),
      )
  const portalUser = getPortalUserFromWindow()
  const userLabel = portalUser?.email?.trim() || portalUser?.name?.trim() || "demo-user"

  const docExtra =
    options.documents.length > 0
      ? {
          document: options.documents.map((d) => ({
            url: d.url.trim(),
            name: d.name.trim() || "document",
          })),
        }
      : {}
  const ccExtra = additionalNotifyEmail ? { additional_notify_email: additionalNotifyEmail } : {}
  const mergedExtra = { ...docExtra, ...ccExtra }
  const payload: DaovanAskPayload = {
    assistant_base_url: getAssistantBaseUrl(),
    assistant_alias: "plagiarism",
    session_id: options.sessionId.trim(),
    session_title,
    user_id: userId,
    prompt: resolvedPrompt,
    user: userLabel,
    project_id: null,
    context: {
      language: "vi",
      project: "plagiarism-checker",
      project_id: null,
      extra_data: Object.keys(mergedExtra).length > 0 ? mergedExtra : undefined,
    },
  }
  if (options.applicationType === "app") {
    payload.application_type = "app"
  } else {
    payload.application_type = "chat"
  }
  if (options.modelId?.trim()) payload.model_id = options.modelId.trim()
  return payload
}

export async function checkPlagiarism(payload: DaovanAskPayload): Promise<CheckResponse> {
  const base = getApiBase()
  const path = getAskEndpointPath(base)
  return requestByBase<CheckResponse>(base, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export async function fetchTask(taskId: string, userId?: string): Promise<TaskResponse> {
  const base = getApiBase()
  const uid = (userId ?? getPlagiarismUserId()).trim()
  const path = getTaskEndpointPath(base, taskId, uid)
  return requestByBase<TaskResponse>(base, path)
}

export async function fetchSessionTasks(sessionId: string, userId?: string): Promise<NeuSessionTasksResponse | null> {
  const uid = (userId ?? getPlagiarismUserId()).trim()
  const q = new URLSearchParams()
  q.set("session_id", sessionId.trim())
  if (uid) q.set("user_id", uid)
  const base = getApiBase()
  const path = getSessionEndpointPath(base, q)
  try {
    return await requestByBase<NeuSessionTasksResponse>(base, path)
  } catch {
    return null
  }
}

/**
 * GET …/tasks/{task_id}/report?token=… — tài liệu PDF (theo metadata).
 * Trên proxy research dùng alias /v1/task/:id/report?…
 */
export async function fetchTaskReportPdf(taskId: string, token: string, userId?: string): Promise<Blob> {
  const base = getApiBase()
  const params = new URLSearchParams()
  params.set("token", token.trim())
  const uid = (userId ?? getPlagiarismUserId()).trim()
  if (uid) params.set("user_id", uid)
  const path = getTaskReportPath(base, taskId, params.toString())
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: "GET",
      credentials: plagiarismFetchCredentials(base, path),
    })
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : t("api.reportPdfFetchFailed"))
  }
  if (!response.ok) {
    const ct = response.headers.get("content-type") || ""
    if (ct.includes("application/json")) {
      const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null
      throw new Error(body?.message || body?.error || t("api.reportErrorStatus", { status: response.status }))
    }
    const text = await response.text().catch(() => "")
    throw new Error(text || t("api.reportErrorStatus", { status: response.status }))
  }
  const ct = response.headers.get("content-type") || ""
  if (ct.includes("application/json")) {
    const j = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(j?.message || t("api.reportJsonInsteadOfPdf"))
  }
  return response.blob()
}

/** Origin cùng site (tab hiện tại hoặc VITE_PORTAL_ORIGIN): POST /api/upload → MinIO, trả `/api/storage/download/...` */
export function getAiPortalOrigin(): string {
  const raw = import.meta.env.VITE_PORTAL_ORIGIN?.trim()
  if (raw) return raw.replace(/\/+$/, "")
  if (typeof window !== "undefined") return window.location.origin.replace(/\/+$/, "")
  return ""
}

export async function uploadFileToAiPortal(file: File, userEmail?: string): Promise<string[]> {
  const origin = getAiPortalOrigin()
  if (!origin) throw new Error(t("api.uploadOriginUnknown"))
  const form = new FormData()
  form.append("file", file)
  if (userEmail?.trim()) form.append("userEmail", userEmail.trim())
  const res = await fetch(`${origin}/api/upload`, {
    method: "POST",
    body: form,
    credentials: "include",
  })
  const data = (await res.json().catch(() => null)) as {
    files?: string[]
    error?: string
    details?: unknown
    status?: string
    errors?: string[]
  } | null
  if (!res.ok && res.status !== 207) {
    throw new Error(data?.error || t("api.uploadFailedStatus", { status: res.status }))
  }
  const files = Array.isArray(data?.files) ? data.files.filter((u): u is string => typeof u === "string" && Boolean(u.trim())) : []
  if (files.length === 0) {
    throw new Error(data?.error || t("api.uploadNoFileUrl"))
  }
  return files
}

/** Metadata đầy đủ từ dịch vụ đạo văn (GET /metadata hoặc /health khi base là proxy nhúng research). */
export async function fetchAskApiMetadata(): Promise<Record<string, unknown> | null> {
  const base = getApiBase()
  const path = getMetadataOrHealthPath(base)
  try {
    return await requestByBase<Record<string, unknown>>(base, path)
  } catch {
    return null
  }
}

/** Theo metadata: có progress/async hoặc workflow có status_endpoint (theo doc). */
export function plagiarismMetadataSupportsProgress(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== "object") return false
  const caps = meta.capabilities
  if (Array.isArray(caps) && caps.some((x) => x === "progress_tracking" || x === "async_scan")) return true
  const wf = meta.workflow
  if (wf && typeof wf === "object") {
    const w = wf as Record<string, unknown>
    const se = w.status_endpoint
    if (typeof se === "string" && se.toLowerCase().includes("task")) return true
  }
  return false
}

export function plagiarismMetadataSupportsPdfReport(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== "object") return false
  const caps = meta.capabilities
  if (Array.isArray(caps) && caps.includes("pdf_report")) return true
  const wf = meta.workflow
  if (wf && typeof wf === "object") {
    const w = wf as Record<string, unknown>
    if (typeof w.report_endpoint === "string" && w.report_endpoint.length > 0) return true
  }
  return false
}
