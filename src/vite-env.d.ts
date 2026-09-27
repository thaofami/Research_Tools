/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLAGIARISM_API_BASE?: string
  readonly VITE_PLAGIARISM_ASSISTANT_BASE_URL?: string
  readonly VITE_PLAGIARISM_USER_ID?: string
  /** Khi dev localhost: gốc site có /api/upload (vd. https://research.neu.edu.vn) */
  readonly VITE_PORTAL_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
