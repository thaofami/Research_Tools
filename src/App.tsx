import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  HelpCircle,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Upload,
  X,
  XCircle,
} from "lucide-react"
import {
  buildDaovanAskPayload,
  checkPlagiarism,
  fetchAskApiMetadata,
  fetchSessionTasks,
  fetchTask,
  findNeuSessionTaskForId,
  getPlagiarismUserId,
  newSessionId,
  plagiarismMetadataSupportsProgress,
  setPlagiarismUserId,
  uploadFileToAiPortal,
} from "./api"
import { getPortalUserFromWindow, isLikelyPortalEmbed, parsePortalUserMessage } from "./portal-user"
import type { CheckResponse, NeuSessionTaskRow, TaskResponse } from "./types"
import { getLocale, t } from "./i18n"

function safeText(value: string | null | undefined, fallback = t("common.noContent")): string {
  return value && value.trim() ? value : fallback
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatVnDateTime(iso: string): string {
  try {
    const locale = getLocale() === "vi" ? "vi-VN" : "en-US"
    return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(new Date(iso))
  } catch {
    return iso
  }
}

type UploadedFileMeta = {
  fileName: string
  sizeBytes: number
  uploadedAtIso: string
  uploadDurationMs: number
}

type AttachmentCheckMeta =
  | {
      kind: "upload"
      files: UploadedFileMeta[]
    }
  | {
      kind: "urls"
      items: Array<{ name: string }>
    }

type RunCheckFileOpts = {
  uploadedFiles: UploadedFileMeta[]
}

function badgeClass(status: string): string {
  if (status === "success" || status === "completed")
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200"
  if (status === "error" || status === "failed")
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
  if (status === "processing" || status === "running")
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
  if (status === "queued" || status === "pending")
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
}

function statusText(status: string): string {
  if (status === "success") return t("status.success")
  if (status === "error") return t("status.error")
  if (status === "completed") return t("status.completed")
  if (status === "failed") return t("status.failed")
  if (status === "processing" || status === "running") return t("status.processing")
  if (status === "pending") return t("status.pending")
  if (status === "queued") return t("status.queued")
  return t("status.updating")
}

/** Thông báo tiếp nhận chung từ API (chế độ email): thay bằng copy rõ ràng hơn trong UI. */
function isGenericReceiptStageMessage(s: string): boolean {
  const t = s.replace(/\s+/g, " ").trim()
  if (!t) return false
  return (/tiếp\s*nhận|đã\s*nhận/iu.test(t) || /yêu\s*cầu/iu.test(t)) && /đạo\s*văn|kiểm\s*tra\s*đạo\s*văn/iu.test(t)
}

function normEmailLower(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase()
}

/** Thông báo đã gửi email kết quả (chế độ gửi email / app). */
function buildPlagiarismEmailResultNotice(primary: string | undefined, additional?: string): string {
  const p = primary?.trim()
  const a = additional?.trim()
  const aOk = a && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(a) && normEmailLower(a) !== normEmailLower(p)
  if (p && aOk) {
    return t("email.completedWithCopy", { primary: p, additional: a })
  }
  if (p) {
    return t("email.completedPrimary", { primary: p })
  }
  return t("email.completedUnknown")
}

function neuSessionRowSucceeded(status: string): boolean {
  const s = status.toLowerCase()
  return s === "completed" || s === "success"
}

function neuSessionRowFailed(status: string): boolean {
  const s = status.toLowerCase()
  return s === "failed" || s === "error"
}

function mapNeuRowToCheckStatus(row: NeuSessionTaskRow): CheckResponse["status"] {
  const s = String(row.status || "").toLowerCase()
  if (s === "completed" || s === "success") return "success"
  if (s === "failed" || s === "error") return "error"
  if (s === "running") return "running"
  if (s === "pending") return "pending"
  if (s === "processing") return "processing"
  if (s === "queued") return "queued"
  return "processing"
}

function mergeProgressMeta(
  prev: CheckResponse,
  row?: NeuSessionTaskRow | null,
  task?: TaskResponse | null,
): CheckResponse["meta"] {
  const smRow = row?.stage_message != null ? String(row.stage_message) : ""
  const smTask = task?.stage_message != null ? String(task.stage_message) : ""
  const stage_message = smRow.trim() ? smRow : smTask.trim() ? smTask : prev.meta?.stage_message
  const pct =
    typeof row?.progress_percent === "number"
      ? row.progress_percent
      : typeof task?.progress_percent === "number"
        ? task.progress_percent
        : prev.meta && typeof prev.meta.progress_percent === "number"
          ? prev.meta.progress_percent
          : undefined
  const current_stage =
    typeof row?.current_stage === "string"
      ? row.current_stage
      : typeof task?.current_stage === "string"
        ? task.current_stage
        : typeof prev.meta?.current_stage === "string"
          ? prev.meta.current_stage
          : undefined
  return {
    ...prev.meta,
    ...(stage_message !== undefined ? { stage_message } : {}),
    ...(pct !== undefined ? { progress_percent: pct } : {}),
    ...(current_stage !== undefined ? { current_stage } : {}),
  }
}

function parseDocumentUrls(raw: string): Array<{ url: string; name: string }> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out: Array<{ url: string; name: string }> = []
  for (const line of lines) {
    try {
      const u = new URL(line)
      const path = u.pathname.split("/").filter(Boolean)
      let name = path.length ? decodeURIComponent(path[path.length - 1] || "document") : "document"
      const fromQuery = u.searchParams.get("name") || u.searchParams.get("filename") || u.searchParams.get("file")
      if (fromQuery?.trim()) name = decodeURIComponent(fromQuery.trim())
      out.push({ url: line, name: name || "document" })
    } catch {
      // bỏ dòng không phải URL hợp lệ
    }
  }
  return out
}

function partitionUploadableFiles(files: File[]): { valid: File[]; rejectedNames: string[] } {
  const rejectedNames: string[] = []
  const valid: File[] = []
  for (const file of files) {
    const ext = (file.name.split(".").pop() || "").toLowerCase()
    if (!["pdf", "doc", "docx"].includes(ext)) rejectedNames.push(file.name)
    else valid.push(file)
  }
  return { valid, rejectedNames }
}

/** Đã có báo cáo xong và không còn chờ poll — upload file mới sẽ bỏ qua URL / kết quả lượt trước. */
function hasCompletedPlagiarismReport(r: CheckResponse | null, isPolling: boolean): boolean {
  if (!r || isPolling) return false
  if (r.status === "success" || r.status === "completed") return true
  return Boolean(r.content_markdown && String(r.content_markdown).trim())
}

/**
 * Cổng upload đôi khi trả về nhiều chuỗi cho một lần POST (trùng nhau hoặc nhiều biểu diễn cùng tệp).
 * Gửi đạo văn: coi **một tệp người chọn = một tài liệu** — chỉ giữ một URL (ưu tiên bản đầu sau khi loại trùng).
 */
function urlsForOneUploadedFile(urls: string[]): string[] {
  const trimmed = urls.map((u) => u.trim()).filter(Boolean)
  const deduped: string[] = []
  const seen = new Set<string>()
  for (const u of trimmed) {
    if (seen.has(u)) continue
    seen.add(u)
    deduped.push(u)
  }
  if (deduped.length <= 1) return deduped
  return [deduped[0]!]
}

/** Một URL đã chuẩn hóa / tệp → một phần tử document[] gửi API. */
function urlsToNamedDocuments(urls: string[], sourceFileName: string): Array<{ url: string; name: string }> {
  const cleaned = urlsForOneUploadedFile(urls)
  if (cleaned.length === 0) return []
  return [{ url: cleaned[0]!, name: sourceFileName }]
}

function extractTaskId(res: CheckResponse): string {
  const fromRoot = typeof res.task_id === "string" ? res.task_id.trim() : ""
  if (fromRoot) return fromRoot
  const fromMeta = typeof res.meta?.task_id === "string" ? res.meta.task_id.trim() : ""
  return fromMeta
}

type PlagiarismResultTab = { id: string; label: string; body: string }

/**
 * Báo cáo dịch vụ NEU thường có dạng: phần đầu (# …) rồi `---` rồi lặp `## **Báo cáo mục N: …**`.
 * Tách tab: Tổng quan + từng mục (ít nhất một mục sau phần đầu).
 * `omitDirectInputSection`: ẩn mục «Nội dung nhập trực tiếp» khi người dùng không nhập văn bản lúc gửi kiểm tra.
 */
function parsePlagiarismResultTabs(
  markdown: string,
  options?: { omitDirectInputSection?: boolean },
): PlagiarismResultTab[] | null {
  const text = markdown.replace(/\r\n/g, "\n").trim()
  if (!text) return null
  const splitRe = /\n---\s*\n+(?=##\s*\*\*Báo cáo mục)/gi
  const parts = text.split(splitRe).map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null

  const tabs: PlagiarismResultTab[] = [{ id: "tq", label: t("results.overviewTab"), body: parts[0]! }]
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i]!
    const m = block.match(/^##\s*\*\*([^*]+)\*\*/u)
    let label = (m?.[1] ?? t("results.tabFallback", { index: i })).trim()
    label = label.replace(/^Báo cáo mục\s*\d+\s*:\s*/iu, "").trim() || t("results.tabFallback", { index: i })
    if (label.length > 40) label = `${label.slice(0, 37)}…`
    tabs.push({ id: `m${i}`, label, body: block })
  }

  let out = tabs
  if (options?.omitDirectInputSection) {
    out = tabs.filter((tab) => {
      if (tab.id === "tq") return true
      const sniff = `${tab.label}\n${tab.body.slice(0, 200)}`
      return !/nhập\s*trực\s*tiếp/iu.test(sniff)
    })
  }

  if (out.length < 2) return null
  return out
}

function PlagiarismMarkdownBlock({ source }: { source: string }) {
  return (
    <div className="plagiarism-markdown max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

function fieldLabel(name: string, hint?: string) {
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0">
      <span className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200">{name}</span>
      {hint ? <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </div>
  )
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sessionId, setSessionId] = useState(() => newSessionId())
  const [sessionTitleInput, setSessionTitleInput] = useState("")
  const [userIdInput, setUserIdInput] = useState(() => getPlagiarismUserId())
  /** Chế độ gửi email: nhận bản sao kết quả tại địa chỉ khác email chính (vd. khi đã có email Portal). */
  const [additionalEmailInput, setAdditionalEmailInput] = useState("")
  const [textInput, setTextInput] = useState("")
  const [documentUrlsRaw, setDocumentUrlsRaw] = useState("")
  /** URL đã upload → tên file gốc (path URL thường là hash, không dùng để hiển thị). */
  const [documentUrlLabels, setDocumentUrlLabels] = useState<Record<string, string>>({})
  const [useAppMode, setUseAppMode] = useState(false)
  const [autoPoll, setAutoPoll] = useState(false)

  const [supportsTaskProgress, setSupportsTaskProgress] = useState(false)

  const [loadingAction, setLoadingAction] = useState<null | "check" | "upload">(null)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckResponse | null>(null)
  const [taskId, setTaskId] = useState("")
  const [attachmentCheckMeta, setAttachmentCheckMeta] = useState<AttachmentCheckMeta | null>(null)
  const [fileDropHover, setFileDropHover] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [resultTabId, setResultTabId] = useState("tq")
  /** Gắn với lần gọi API gần nhất: ô văn bản trống → ẩn tab «Nội dung nhập trực tiếp» trong báo cáo. */
  const checkHadEmptyDirectTextRef = useRef(false)
  /** Email chính / phụ đã gửi lên API ở lần «Bắt đầu kiểm tra» gần nhất (thông báo khi poll xong). */
  const appEmailSnapshotRef = useRef<{ primary?: string; additional?: string }>({})

  useEffect(() => {
    if (!helpOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [helpOpen])

  useEffect(() => {
    const fromWin = getPortalUserFromWindow()
    if (fromWin?.email?.trim()) {
      setUserIdInput(fromWin.email.trim())
      setPlagiarismUserId(fromWin.email.trim())
    } else {
      setUserIdInput(getPlagiarismUserId())
    }
    const onMsg = (e: MessageEvent) => {
      const u = parsePortalUserMessage(e.data)
      if (u?.email?.trim()) {
        setUserIdInput(u.email.trim())
        setPlagiarismUserId(u.email.trim())
      }
    }
    window.addEventListener("message", onMsg)
    let t: ReturnType<typeof setTimeout> | undefined
    if (window.parent !== window) {
      window.parent.postMessage({ type: "PLAGIARISM_CHECKER_NEED_PORTAL_USER" }, "*")
      t = setTimeout(() => window.parent.postMessage({ type: "PLAGIARISM_CHECKER_NEED_PORTAL_USER" }, "*"), 1200)
    }
    return () => {
      window.removeEventListener("message", onMsg)
      if (t) clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAskApiMetadata().then((meta) => {
      if (cancelled) return
      setSupportsTaskProgress(plagiarismMetadataSupportsProgress(meta))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!useAppMode) setAdditionalEmailInput("")
  }, [useAppMode])

  type ResultSummary = { kind: "markdown"; source: string } | { kind: "plain"; text: string }

  const resultSummary = useMemo((): ResultSummary => {
    if (!result) {
      if (loadingAction === "check") {
        return { kind: "plain", text: t("results.checking") }
      }
      if (loadingAction === "upload") {
        return { kind: "plain", text: t("results.uploading") }
      }
      return {
        kind: "plain",
        text: t("results.noResultYet"),
      }
    }
    if (result.status === "error") return { kind: "plain", text: safeText(result.message ?? undefined, t("results.checkFailed")) }
    if (result.content_markdown && String(result.content_markdown).trim()) {
      return { kind: "markdown", source: String(result.content_markdown) }
    }
    const portalEmail = getPortalUserFromWindow()?.email?.trim() ?? ""
    const emailForCopy =
      portalEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(portalEmail)
        ? portalEmail
        : /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(userIdInput.trim())
          ? userIdInput.trim()
          : undefined
    if (
      (result.status === "success" || result.status === "completed") &&
      result.message != null &&
      String(result.message).trim()
    ) {
      return { kind: "plain", text: String(result.message).trim() }
    }
    const meta = result.meta as { stage_message?: string } | undefined
    const staged = meta?.stage_message != null ? String(meta.stage_message) : ""
    if (staged.trim()) {
      if (!(useAppMode && isGenericReceiptStageMessage(staged))) {
        return { kind: "plain", text: safeText(staged) }
      }
    }
    if (result.status === "queued") {
      if (useAppMode) {
        const appPrimary =
          portalEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(portalEmail)
            ? portalEmail
            : /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(userIdInput.trim())
              ? userIdInput.trim()
              : undefined
        const addT = additionalEmailInput.trim()
        const addOk =
          addT &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(addT) &&
          appPrimary &&
          addT.toLowerCase() !== appPrimary.toLowerCase()
        if (appPrimary && addOk) {
          return {
            kind: "plain",
            text: t("results.receivedRequestEmailWithCopy", { primary: appPrimary, additional: addT }),
          }
        }
        const hint = emailForCopy
          ? t("results.receivedRequestEmailKnown", { email: emailForCopy })
          : t("results.receivedRequestEmailUnknown")
        return { kind: "plain", text: hint }
      }
      return {
        kind: "plain",
        text: t("results.receivedRequestSimple"),
      }
    }
    return { kind: "plain", text: t("results.processing") }
  }, [result, loadingAction, useAppMode, userIdInput, additionalEmailInput])

  const plagiarismMarkdownSource = resultSummary.kind === "markdown" ? resultSummary.source : ""
  const plagiarismTabs = useMemo(() => {
    if (!plagiarismMarkdownSource) return null
    return parsePlagiarismResultTabs(plagiarismMarkdownSource, {
      omitDirectInputSection: checkHadEmptyDirectTextRef.current,
    })
  }, [plagiarismMarkdownSource])

  useEffect(() => {
    if (plagiarismTabs?.length) setResultTabId(plagiarismTabs[0]!.id)
  }, [plagiarismMarkdownSource])

  /** Ưu tiên ô nhập, rồi email từ phiên nhúng, rồi giá trị đã lưu — dùng khi không còn form «Tài khoản» riêng. */
  function resolveUserIdForActions(): string {
    return (
      userIdInput.trim() ||
      getPortalUserFromWindow()?.email?.trim() ||
      getPortalUserFromWindow()?.id?.trim() ||
      getPlagiarismUserId().trim()
    )
  }

  function isValidEmailLike(s: string): boolean {
    const t = s.trim()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(t)
  }

  /** Chế độ từng bước: bắt buộc email hợp lệ (từ phiên đăng nhập nhúng hoặc ô nhập). */
  function resolveEmailForAppMode(): string | null {
    const fromPortal = getPortalUserFromWindow()?.email?.trim()
    if (fromPortal && isValidEmailLike(fromPortal)) return fromPortal
    const manual = userIdInput.trim()
    if (manual && isValidEmailLike(manual)) return manual
    return null
  }

  const blockAppModeWithoutEmail = useAppMode && resolveEmailForAppMode() === null
  const portalEmailRaw = getPortalUserFromWindow()?.email?.trim() ?? ""
  const portalEmailValidForApp = portalEmailRaw !== "" && isValidEmailLike(portalEmailRaw)
  const additionalEmailTrim = additionalEmailInput.trim()
  const additionalEmailInvalid =
    useAppMode && additionalEmailTrim !== "" && !isValidEmailLike(additionalEmailTrim)
  const blockAppModeBadAdditional = useAppMode && additionalEmailInvalid

  /** Email gửi kèm upload: chế độ từng bước = bắt buộc email hợp lệ; chế độ thường = email nếu ô nhập là email. */
  function emailForPortalUpload(): string | undefined {
    if (useAppMode) return resolveEmailForAppMode() ?? undefined
    const u = resolveUserIdForActions()
    return u.includes("@") ? u : undefined
  }

  /** Upload danh sách tệp lên cổng (storage), trả URL + meta cho bước kiểm tra sau. */
  async function uploadFilesAndBuildDocuments(
    filesSnapshot: File[],
    email: string | undefined,
  ): Promise<{ extraDocs: Array<{ url: string; name: string }>; uploadedMeta: UploadedFileMeta[]; urlLines: string[] }> {
    const uploadedMeta: UploadedFileMeta[] = []
    const extraDocs: Array<{ url: string; name: string }> = []
    const urlLines: string[] = []
    for (const file of filesSnapshot) {
      const tUpload0 = performance.now()
      const urlsRaw = await uploadFileToAiPortal(file, email)
      const urls = urlsForOneUploadedFile(urlsRaw)
      const uploadDurationMs = Math.round(performance.now() - tUpload0)
      const uploadedAtIso = new Date().toISOString()
      uploadedMeta.push({
        fileName: file.name,
        sizeBytes: file.size,
        uploadedAtIso,
        uploadDurationMs,
      })
      extraDocs.push(...urlsToNamedDocuments(urls, file.name))
      for (const u of urls) {
        const t = u.trim()
        if (t) urlLines.push(t)
      }
    }
    return { extraDocs, uploadedMeta, urlLines }
  }

  async function runCheckAfterExtraDocuments(extra: Array<{ url: string; name: string }>, opts?: RunCheckFileOpts) {
    const docs = [...parseDocumentUrls(documentUrlsRaw), ...extra]
    const unique = new Map<string, { url: string; name: string }>()
    for (const d of docs) {
      const url = d.url.trim()
      const label = documentUrlLabels[url] ?? d.name
      unique.set(url, { url, name: label.trim() || d.name })
    }
    const merged = [...unique.values()]
    if (!textInput.trim() && merged.length === 0) {
      setError(t("errors.needTextOrFile"))
      return
    }
    if (useAppMode && additionalEmailInput.trim() !== "" && !isValidEmailLike(additionalEmailInput.trim())) {
      setError(t("errors.additionalEmailInvalidFix"))
      return
    }
    checkHadEmptyDirectTextRef.current = textInput.trim() === ""
    setResult(null)
    if (opts?.uploadedFiles?.length) {
      setAttachmentCheckMeta({ kind: "upload", files: opts.uploadedFiles })
    } else if (merged.length > 0) {
      setAttachmentCheckMeta({ kind: "urls", items: merged.map((d) => ({ name: d.name })) })
    } else {
      setAttachmentCheckMeta(null)
    }
    const appPrimaryResolved = useAppMode ? resolveEmailForAppMode() : null
    const addRaw = additionalEmailInput.trim()
    const addValidForPayload =
      Boolean(useAppMode && appPrimaryResolved) &&
      addRaw !== "" &&
      isValidEmailLike(addRaw) &&
      addRaw.toLowerCase() !== appPrimaryResolved!.toLowerCase()
    appEmailSnapshotRef.current =
      useAppMode && appPrimaryResolved
        ? { primary: appPrimaryResolved, additional: addValidForPayload ? addRaw : undefined }
        : {}
    const uidForPayload = (useAppMode ? appPrimaryResolved ?? resolveUserIdForActions() : resolveUserIdForActions()).trim()
    setPlagiarismUserId(uidForPayload)
    const currentSession = sessionId.trim() || newSessionId()
    setSessionId(currentSession)
    setLoadingAction("check")
    setError(null)
    setTaskId("")
    try {
      const payload = buildDaovanAskPayload({
        sessionId: currentSession,
        prompt: textInput.trim(),
        applicationType: useAppMode ? "app" : "chat",
        documents: merged,
        sessionTitle: sessionTitleInput.trim() || undefined,
        userIdForRequest: uidForPayload || undefined,
        additionalNotifyEmail: addValidForPayload ? addRaw : undefined,
      })
      const response = await checkPlagiarism(payload)
      setResult(response)
      const resolvedTaskId = extractTaskId(response)
      const transitionalStatus =
        response.status === "queued" ||
        response.status === "running" ||
        response.status === "pending" ||
        response.status === "processing"
      const shouldPoll =
        Boolean(resolvedTaskId) &&
        transitionalStatus &&
        (useAppMode || supportsTaskProgress)
      if (resolvedTaskId) {
        setTaskId(resolvedTaskId)
        setAutoPoll(shouldPoll)
      } else {
        setTaskId("")
        setAutoPoll(false)
      }
      if (response.session_id) setSessionId(String(response.session_id).trim())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errors.serviceUnreachable"))
    } finally {
      setLoadingAction(null)
    }
  }

  async function onCheckPlagiarism() {
    const docs = parseDocumentUrls(documentUrlsRaw)
    if (!textInput.trim() && docs.length === 0) {
      setError(t("errors.needTextOrFileWithHint"))
      return
    }
    if (useAppMode && !resolveEmailForAppMode()) {
      setError(t("errors.stepModeNeedsEmail"))
      return
    }
    await runCheckAfterExtraDocuments([])
  }

  /** Kéo thả hoặc chọn tệp → upload lên cổng, gom URL (chưa gọi kiểm tra). */
  async function uploadPortalFiles(incoming: File[]) {
    if (incoming.length === 0) return
    const { valid, rejectedNames } = partitionUploadableFiles(incoming)
    if (rejectedNames.length > 0) {
      setError(
        rejectedNames.length === incoming.length
          ? t("errors.onlyPdfOrWord")
          : t("errors.skippedInvalidFiles", {
              count: rejectedNames.length,
              names: rejectedNames.slice(0, 3).join(", "),
              ellipsis: rejectedNames.length > 3 ? "…" : "",
            }),
      )
    }
    if (valid.length === 0) return
    if (useAppMode && !resolveEmailForAppMode()) {
      setError(t("errors.stepModeNeedsEmailUpload"))
      return
    }
    if (useAppMode && additionalEmailInput.trim() !== "" && !isValidEmailLike(additionalEmailInput.trim())) {
      setError(t("errors.additionalEmailInvalidFix"))
      return
    }
    const startNewFileRound = hasCompletedPlagiarismReport(result, autoPoll)
    if (startNewFileRound) {
      setResult(null)
      setAttachmentCheckMeta(null)
      setDocumentUrlLabels({})
      setTaskId("")
      setAutoPoll(false)
    }
    setError(null)
    setLoadingAction("upload")
    setUploadMessage(t("results.uploading"))
    const email = emailForPortalUpload()
    try {
      const { urlLines, extraDocs } = await uploadFilesAndBuildDocuments(valid, email)
      if (urlLines.length > 0) {
        if (startNewFileRound) {
          setDocumentUrlsRaw(urlLines.join("\n"))
        } else {
          setDocumentUrlsRaw((prev) => (prev.trim() ? `${prev.trim()}\n${urlLines.join("\n")}` : urlLines.join("\n")))
        }
      }
      if (extraDocs.length > 0) {
        setDocumentUrlLabels((prev) => {
          const next: Record<string, string> = startNewFileRound ? {} : { ...prev }
          for (const d of extraDocs) {
            const u = d.url.trim()
            if (!u) continue
            const nm = d.name.trim()
            next[u] = nm || (!startNewFileRound ? prev[u] : "") || "document"
          }
          return next
        })
      }
      setUploadMessage(
        valid.length > 1
          ? t("upload.multipleFilesDone", { count: valid.length })
          : t("upload.singleFileDone", { name: valid[0]!.name }),
      )
    } catch (err: unknown) {
      setUploadMessage(null)
      setError(err instanceof Error ? err.message : t("errors.uploadFailed"))
    } finally {
      setLoadingAction(null)
    }
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ""
    void uploadPortalFiles(list)
  }

  function onFileDropZoneDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setFileDropHover(true)
  }

  function onFileDropZoneDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setFileDropHover(false)
  }

  function onFileDropZoneDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
  }

  function onFileDropZoneDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setFileDropHover(false)
    if (loadingAction !== null) return
    const list = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : []
    void uploadPortalFiles(list)
  }

  function resetAll() {
    setSessionId(newSessionId())
    setSessionTitleInput("")
    setTextInput("")
    setDocumentUrlsRaw("")
    setDocumentUrlLabels({})
    setUseAppMode(false)
    setAutoPoll(false)
    setError(null)
    setResult(null)
    setTaskId("")
    setAdditionalEmailInput("")
    appEmailSnapshotRef.current = {}
    setUploadMessage(null)
    setAttachmentCheckMeta(null)
  }

  useEffect(() => {
    if (!autoPoll || !taskId.trim()) return
    if (!supportsTaskProgress && !useAppMode) return

    const tid = taskId.trim()
    const sid = sessionId.trim()
    let inFlight = false
    let cancelled = false

    const tick = () => {
      if (inFlight) return
      inFlight = true
      void (async () => {
        try {
          const uid = resolveUserIdForActions()
          const portalEmail = getPortalUserFromWindow()?.email?.trim() ?? ""
          const emailForNotice =
            portalEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(portalEmail)
              ? portalEmail
              : /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(userIdInput.trim())
                ? userIdInput.trim()
                : undefined

          const sessionPayload = sid ? await fetchSessionTasks(sid, uid) : null
          const tasks = sessionPayload?.meta?.tasks
          const row = Array.isArray(tasks) ? findNeuSessionTaskForId(tasks as NeuSessionTaskRow[], tid) : null

          let taskRes: TaskResponse | null = null
          try {
            taskRes = await fetchTask(tid, uid)
          } catch {
            taskRes = null
          }

          if (cancelled) return

          let stopPoll = false
          setResult((prev) => {
          if (!prev) return prev

          const mdFromTask = taskRes?.content_markdown && String(taskRes.content_markdown).trim()
          if (mdFromTask) {
            stopPoll = true
            return {
              status: "success",
              session_id: taskRes?.session_id ?? prev.session_id,
              content_markdown: String(taskRes!.content_markdown),
              task_id: taskRes?.task_id ?? prev.task_id ?? tid,
              meta: { ...prev.meta, ...taskRes?.meta },
              message: null,
            }
          }

          const rowDone = row ? neuSessionRowSucceeded(row.status) : false
          const rowFail = row ? neuSessionRowFailed(row.status) : false
          const taskFail = taskRes && (taskRes.status === "failed" || taskRes.status === "error")
          const taskSucceeded = taskRes && (taskRes.status === "completed" || taskRes.status === "success")

          if (taskFail || rowFail) {
            stopPoll = true
            const msg =
              (taskRes?.message && String(taskRes.message)) ||
              (typeof taskRes?.error === "string" && taskRes.error) ||
              (row?.stage_message != null && String(row.stage_message)) ||
              t("errors.checkUnsuccessful")
            return {
              ...prev,
              status: "error",
              message: msg,
              meta: mergeProgressMeta(prev, row, taskRes),
              task_id: taskRes?.task_id ?? row?.task_id ?? prev.task_id,
              session_id: taskRes?.session_id ?? row?.session_id ?? prev.session_id,
            }
          }

          const finishedWithoutMarkdown = Boolean(taskSucceeded) || rowDone
          if (finishedWithoutMarkdown) {
            stopPoll = true
            return {
              status: "success",
              session_id: taskRes?.session_id ?? row?.session_id ?? prev.session_id,
              content_markdown: null,
              task_id: taskRes?.task_id ?? row?.task_id ?? prev.task_id ?? tid,
              meta: mergeProgressMeta(prev, row, taskRes),
              message: useAppMode
                ? buildPlagiarismEmailResultNotice(
                    appEmailSnapshotRef.current.primary,
                    appEmailSnapshotRef.current.additional,
                  )
                : buildPlagiarismEmailResultNotice(emailForNotice),
            }
          }

          if (!row && !taskRes) return prev

          const nextTop =
            row != null
              ? mapNeuRowToCheckStatus(row)
              : taskRes
                ? mapNeuRowToCheckStatus({
                    task_id: taskRes.task_id,
                    status: taskRes.status,
                    stage_message: taskRes.stage_message ?? null,
                    progress_percent: taskRes.progress_percent,
                    current_stage: taskRes.current_stage,
                  })
                : prev.status

          return {
            ...prev,
            status: nextTop,
            meta: mergeProgressMeta(prev, row, taskRes),
            session_id: taskRes?.session_id ?? row?.session_id ?? prev.session_id,
            task_id: taskRes?.task_id ?? row?.task_id ?? prev.task_id,
          }
        })

          if (stopPoll) setAutoPoll(false)
        } finally {
          inFlight = false
        }
      })()
    }

    tick()
    const timer = window.setInterval(tick, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [supportsTaskProgress, autoPoll, taskId, userIdInput, sessionId, useAppMode])

  const cardClass =
    "rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900"

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="relative z-[100] flex w-full shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/95 px-5 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold text-slate-800 sm:text-lg dark:text-slate-100">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-600/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
              <FileText className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 truncate">{t("header.title")}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-expanded={helpOpen}
            aria-controls="plagiarism-help-dialog"
            aria-label={t("header.help")}
            title={t("header.help")}
          >
            <HelpCircle className="h-5 w-5 text-amber-700 dark:text-amber-400" aria-hidden />
          </button>
        </div>
      </header>

      <div className="w-full max-w-none flex-1 px-5 pt-5 pb-8 sm:px-6 sm:pt-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start lg:gap-6 xl:gap-8">
          <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
          <section className={`${cardClass} p-4 sm:p-5`}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("mode.title")}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setUseAppMode(false)}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  !useAppMode
                    ? "border-amber-600 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/35"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <MessageSquare className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  {t("mode.chat.title")}
                </div>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{t("mode.chat.desc")}</p>
              </button>
              <button
                type="button"
                onClick={() => setUseAppMode(true)}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  useAppMode
                    ? "border-amber-600 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/35"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  {t("mode.app.title")}
                </div>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {t("mode.app.desc")}
                </p>
              </button>
            </div>
            {useAppMode ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-600 dark:bg-slate-900">
                {portalEmailValidForApp ? (
                  <div className="space-y-3">
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      {t("mode.app.resultSentTo")} <span className="font-medium">{portalEmailRaw}</span>
                    </p>
                    {fieldLabel(t("mode.app.additionalEmailLabel"), t("mode.app.additionalEmailHintCopy"))}
                    <input
                      type="email"
                      value={additionalEmailInput}
                      onChange={(e) => setAdditionalEmailInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600 focus:outline-none dark:border-slate-600 dark:bg-slate-950"
                      placeholder={t("mode.app.additionalEmailPlaceholder")}
                      autoComplete="email"
                    />
                    <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                      {t("mode.app.additionalEmailHelpLoggedIn")}
                    </p>
                    {additionalEmailInvalid ? (
                      <p className="text-xs text-rose-600 dark:text-rose-400">{t("mode.app.additionalEmailInvalid")}</p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {fieldLabel(t("mode.app.emailLabel"), t("mode.app.emailRequiredHint"))}
                    <input
                      value={userIdInput}
                      onChange={(e) => setUserIdInput(e.target.value)}
                      onBlur={() => setPlagiarismUserId(userIdInput.trim())}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600 focus:outline-none dark:border-slate-600 dark:bg-slate-950"
                      placeholder={t("mode.app.emailPlaceholder")}
                      autoComplete="username"
                    />
                    {isLikelyPortalEmbed() ? (
                      <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{t("mode.app.loginToAutofill")}</p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("mode.app.uploadFollowsAccount")}</p>
                    )}
                    {blockAppModeWithoutEmail ? (
                      <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{t("mode.app.needValidEmail")}</p>
                    ) : null}
                    {!blockAppModeWithoutEmail ? (
                      <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 dark:border-slate-600">
                        {fieldLabel(t("mode.app.additionalEmailLabel2"), t("mode.app.additionalEmailHint2"))}
                        <input
                          type="email"
                          value={additionalEmailInput}
                          onChange={(e) => setAdditionalEmailInput(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600 focus:outline-none dark:border-slate-600 dark:bg-slate-950"
                          placeholder={t("mode.app.additionalEmailPlaceholder2")}
                          autoComplete="email"
                        />
                        <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                          {t("mode.app.additionalEmailHelp2")}
                        </p>
                        {additionalEmailInvalid ? (
                          <p className="text-xs text-rose-600 dark:text-rose-400">{t("mode.app.additionalEmailInvalid")}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </section>

          <section className={`${cardClass} p-4 sm:p-5`}>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("content.title")}</h2>
            {fieldLabel(t("content.textLabel"))}
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={4}
              className="mb-3 min-h-[5.5rem] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-amber-600 dark:border-slate-600 dark:bg-slate-950"
              placeholder={t("content.textPlaceholder")}
            />

            <div className="flex w-full flex-col gap-3">
              <div
                className={`w-full rounded-lg border-2 border-dashed p-4 text-center transition-colors dark:bg-slate-900 ${
                  fileDropHover
                    ? "border-amber-500 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/30"
                    : "border-slate-300 bg-slate-50 dark:border-slate-600"
                }`}
                onDragEnter={onFileDropZoneDragEnter}
                onDragLeave={onFileDropZoneDragLeave}
                onDragOver={onFileDropZoneDragOver}
                onDrop={onFileDropZoneDrop}
              >
                <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{t("content.attachmentsTitle")}</p>
                <p className="mb-2 w-full text-[11px] leading-snug text-slate-500 dark:text-slate-400 sm:mb-3">
                  {t("content.attachmentsHint")}
                </p>
                <div className="flex justify-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,application/pdf"
                    className="sr-only"
                    onChange={onFileChosen}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loadingAction !== null || blockAppModeWithoutEmail || blockAppModeBadAdditional}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100"
                  >
                    {loadingAction === "upload" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {t("content.chooseFiles")}
                  </button>
                </div>
                {uploadMessage ? (
                  <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">{uploadMessage}</p>
                ) : null}
              </div>

              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-y-2 pt-1 max-sm:grid-cols-1 max-sm:justify-items-stretch">
                <div className="max-sm:hidden" aria-hidden />
                <div className="flex justify-center max-sm:order-1 max-sm:justify-self-center">
                  <button
                    type="button"
                    onClick={onCheckPlagiarism}
                    disabled={loadingAction !== null || blockAppModeWithoutEmail || blockAppModeBadAdditional}
                    className="inline-flex max-w-full items-center justify-center gap-1.5 rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-55 dark:border-amber-600 dark:bg-amber-700 dark:hover:bg-amber-600"
                  >
                    {loadingAction === "check" ? <LoaderCircle size={16} className="animate-spin" /> : <ChevronRight size={16} className="shrink-0" aria-hidden />}
                    {t("content.startCheck")}
                  </button>
                </div>
                <div className="flex justify-end max-sm:order-2 max-sm:w-full max-sm:justify-end">
                  <button
                    type="button"
                    onClick={resetAll}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    disabled={loadingAction !== null}
                  >
                    <RefreshCw size={14} className="shrink-0 opacity-80" aria-hidden />
                    {t("content.reset")}
                  </button>
                </div>
              </div>
            </div>
          </section>
          </div>

          <section className={`${cardClass} min-w-0 p-4 sm:p-5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-1.25rem)] lg:overflow-y-auto`}>
            <div className="mb-4 flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Bot className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                {t("results.title")}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {result ? (
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass(result.status)}`}>
                    {result.status === "success" || result.status === "completed" ? <CheckCircle2 size={12} className="mr-1" /> : null}
                    {result.status === "error" || result.status === "failed" ? <XCircle size={12} className="mr-1" /> : null}
                    {statusText(result.status)}
                  </span>
                ) : null}
              </div>
            </div>

            {attachmentCheckMeta ? (
              <div className="mb-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200">
                <p className="mb-1.5 font-semibold text-slate-800 dark:text-slate-100">{t("results.sentDocuments")}</p>
                {attachmentCheckMeta.kind === "upload" ? (
                  <ul className="space-y-3 leading-relaxed text-slate-600 dark:text-slate-300">
                    {attachmentCheckMeta.files.map((m, idx) => (
                      <li
                        key={`${m.fileName}-${idx}-${m.uploadedAtIso}`}
                        className="list-none rounded-md border border-slate-100 bg-slate-50/80 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/50"
                      >
                        <p className="font-medium text-slate-800 dark:text-slate-100">{m.fileName}</p>
                        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11px]">
                          <li>
                            <span className="font-medium text-slate-800 dark:text-slate-100">{t("results.size")}</span> {formatFileSize(m.sizeBytes)}
                          </li>
                          <li>
                            <span className="font-medium text-slate-800 dark:text-slate-100">{t("results.completedAt")}</span> {formatVnDateTime(m.uploadedAtIso)}
                          </li>
                          <li>
                            <span className="font-medium text-slate-800 dark:text-slate-100">{t("results.uploadDuration")}</span>{" "}
                            {m.uploadDurationMs < 1000 ? `${m.uploadDurationMs} ms` : `${(m.uploadDurationMs / 1000).toFixed(1)} s`}
                          </li>
                        </ul>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="list-inside list-disc space-y-0.5 leading-relaxed text-slate-600 dark:text-slate-300">
                    {attachmentCheckMeta.items.map((it, i) => (
                      <li key={`${it.name}-${i}`}>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{t("results.file")}</span> {it.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-600 dark:bg-slate-900">
              {resultSummary.kind === "markdown" ? (
                plagiarismTabs ? (
                  <div>
                    <div
                      role="tablist"
                      aria-label={t("results.tabsAriaLabel")}
                      className="-mx-1 mb-3 flex gap-1 overflow-x-auto border-b border-slate-200/90 px-1 pb-0 dark:border-slate-600"
                    >
                      {plagiarismTabs.map((t) => {
                        const active = resultTabId === t.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            id={`result-tab-${t.id}`}
                            onClick={() => setResultTabId(t.id)}
                            className={`shrink-0 rounded-t-md border border-b-0 px-2.5 py-2 text-left text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                              active
                                ? "relative z-[1] border-slate-300 bg-white text-amber-900 dark:border-slate-500 dark:bg-slate-900 dark:text-amber-200"
                                : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100/90 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-800/80"
                            }`}
                          >
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                    <div role="tabpanel" aria-labelledby={`result-tab-${resultTabId}`}>
                      <PlagiarismMarkdownBlock
                        source={
                          plagiarismTabs.find((t) => t.id === resultTabId)?.body ??
                          plagiarismTabs[0]!.body
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <PlagiarismMarkdownBlock source={resultSummary.source} />
                )
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                  {resultSummary.text}
                </p>
              )}
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {helpOpen ? (
        <div
          id="plagiarism-help-dialog"
          className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-10 sm:pt-14"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plagiarism-help-title"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="relative mb-8 w-full max-w-lg rounded-lg border-2 border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h2 id="plagiarism-help-title" className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {t("help.title")}
              </h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label={t("help.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[min(70vh,420px)] space-y-2.5 overflow-y-auto px-4 py-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300 sm:text-sm">
              <p className="text-slate-600 dark:text-slate-400">
                {t("help.intro")}
              </p>
              <ul className="list-disc space-y-1.5 pl-4 marker:text-amber-700 dark:marker:text-amber-500">
                <li>
                  <strong className="text-slate-900 dark:text-slate-100">{t("help.modeTitle")}</strong> {t("help.modeBody")}
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-slate-100">{t("help.filesTitle")}</strong> {t("help.filesBody")}
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-slate-100">{t("help.afterResultTitle")}</strong> {t("help.afterResultBody")}
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-slate-100">{t("help.startCheckTitle")}</strong> {t("help.startCheckBody")}
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-slate-100">{t("help.resultTitle")}</strong> {t("help.resultBody")}
                </li>
              </ul>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t("help.footer")}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
