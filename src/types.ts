export interface RequestContext {
  language?: string
  project?: string
  project_id?: string | null
  extra_data?: {
    document?: Array<{ name: string; url: string }>
    /** Gửi bản sao thông báo / kết quả tới email phụ (nếu backend hỗ trợ). */
    additional_notify_email?: string
  }
}

/** Payload POST /ask theo hợp đồng daovan (file-search/ai). */
export interface DaovanAskPayload {
  assistant_base_url: string
  assistant_alias: string
  session_id: string
  session_title: string
  user_id: string
  application_type?: "chat" | "app" | ""
  model_id?: string
  prompt: string
  user?: string
  project_id?: string | null
  context?: RequestContext
}

export type CheckPayload = DaovanAskPayload

export interface ApiAttachment {
  label?: string
  type?: string
  url?: string
}

export interface ApiMeta {
  elapsed_ms?: number
  estimated_time_seconds?: number
  model?: string
  task_status?: string
  task_id?: string
  similarity_score?: number
  [key: string]: unknown
}

export interface CheckResponse {
  task_id?: string | null
  status: "success" | "error" | "queued" | "running" | "completed" | "failed" | "pending" | "processing"
  session_id?: string
  content_markdown?: string | null
  attachments?: ApiAttachment[] | null
  meta?: ApiMeta
  message?: string | null
}

export interface TaskResponse {
  task_id: string
  session_id?: string
  status: "pending" | "processing" | "queued" | "running" | "completed" | "failed" | "success" | "error"
  progress?: string
  progress_percent?: number
  current_stage?: string
  stage_message?: string
  content_markdown?: string | null
  meta?: ApiMeta
  elapsed_seconds?: number
  error?: string
  result?: unknown
  message?: string | null
}

export interface BackendStatusResponse {
  success: boolean
  service?: string
  upstream?: string
  health?: string
  routes?: string[]
  name?: string
  version?: string
}

export interface HealthResponse {
  ok: boolean
  upstream?: string
  docs?: string
  message?: string
  name?: string
  version?: string
}

/** GET /session?session_id=&user_id= — danh sách task trong phiên (NEU daovan). */
export interface NeuSessionTaskRow {
  task_id: string
  session_id?: string
  status: string
  progress_percent?: number
  current_stage?: string
  stage_message?: string | null
  pdf_report?: { available?: boolean }
  created_at?: string
  [key: string]: unknown
}

export interface NeuSessionTasksResponse {
  session_id?: string
  status: string
  meta?: {
    total_tasks?: number
    tasks?: NeuSessionTaskRow[]
  }
  message?: string | null
}
