/**
 * Thông tin người dùng khi nhúng (__PORTAL_USER__ hoặc postMessage PORTAL_USER).
 * Cùng pattern PaperFinder / SurveyLab.
 */

export type PortalUserInfo = {
  id: string
  email: string
  name: string
}

export function getPortalUserFromWindow(): PortalUserInfo | null {
  if (typeof window === "undefined") return null
  const u = (window as { __PORTAL_USER__?: { id?: string; email?: string; name?: string } }).__PORTAL_USER__
  if (!u || typeof u.id !== "string" || !u.id.trim()) return null
  const email = typeof u.email === "string" ? u.email : ""
  const name = typeof u.name === "string" ? u.name : email
  return { id: u.id.trim(), email, name }
}

export function parsePortalUserMessage(data: unknown): PortalUserInfo | null {
  if (!data || typeof data !== "object") return null
  const d = data as { type?: string; user?: { id?: string; email?: string; name?: string } }
  if (d.type !== "PORTAL_USER" || !d.user || typeof d.user.id !== "string") return null
  const email = typeof d.user.email === "string" ? d.user.email : ""
  const name = typeof d.user.name === "string" ? d.user.name : email
  return { id: d.user.id.trim(), email, name }
}

export function isLikelyPortalEmbed(): boolean {
  if (typeof window === "undefined") return false
  const w = window as Window & {
    __WRITE_API_BASE__?: string
    __PLAGIARISM_CHECKER_API_BASE__?: string
    __PORTAL_USER__?: unknown
  }
  return Boolean(
    w.parent !== w ||
      (typeof w.__WRITE_API_BASE__ === "string" && w.__WRITE_API_BASE__.trim()) ||
      (typeof w.__PLAGIARISM_CHECKER_API_BASE__ === "string" && w.__PLAGIARISM_CHECKER_API_BASE__.trim()) ||
      w.__PORTAL_USER__,
  )
}
