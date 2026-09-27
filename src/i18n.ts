/**
 * i18n for PlagiarismChecker: English and Vietnamese only.
 * Embedded in AI Portal: Portal signals locale via URL `?locale=` (highest priority) or
 * window.__AI_PORTAL_LOCALE__. Standalone: stored preference, then browser language.
 * Default locale is English; only "vi" ever maps to Vietnamese.
 */

export type Locale = "en" | "vi"

const SUPPORTED: Locale[] = ["en", "vi"]
const STORAGE_KEY = "plagiarismchecker-locale"

declare global {
  interface Window {
    __AI_PORTAL_LOCALE__?: string
  }
}

function normalize(raw: string | null | undefined): Locale | null {
  const v = (raw || "").toLowerCase().split(/[-_]/)[0]
  return v === "vi" ? "vi" : v === "en" ? "en" : null
}

export function getLocale(): Locale {
  if (typeof window === "undefined") return "en"
  try {
    const fromUrl = normalize(new URLSearchParams(window.location.search).get("locale"))
    if (fromUrl) return fromUrl
  } catch {
    /* ignore */
  }
  const fromPortal = normalize(window.__AI_PORTAL_LOCALE__)
  if (fromPortal) return fromPortal
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const fromStorage = normalize(stored)
    if (fromStorage) return fromStorage
  } catch {
    /* ignore */
  }
  try {
    const fromNav = normalize(navigator.language)
    if (fromNav) return fromNav
  } catch {
    /* ignore */
  }
  return "en"
}

export function setLocale(locale: Locale): void {
  if (!SUPPORTED.includes(locale)) return
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* ignore */
  }
}

const messages: Record<Locale, Record<string, string>> = {
  en: {
    // Common
    "common.noContent": "No content",

    // Header
    "header.title": "Plagiarism Check",
    "header.help": "Help",

    // Mode section
    "mode.title": "Mode",
    "mode.chat.title": "Result directly on the page",
    "mode.chat.desc": "Short passages — usually a few seconds to under a minute.",
    "mode.app.title": "Step-by-step processing",
    "mode.app.desc":
      "Long documents / multiple files; results are sent by email (optionally with a PDF). A primary email is required; you may add an email to receive a copy.",
    "mode.app.resultSentTo": "Results will be sent to",
    "mode.app.additionalEmailLabel": "Additional email to receive results (optional)",
    "mode.app.additionalEmailHintCopy": "copy to another address",
    "mode.app.additionalEmailPlaceholder": "e.g. other@school.edu.vn — leave blank to use only the login email",
    "mode.app.additionalEmailHelpLoggedIn":
      "Fill in if you'd also like the system to send a copy of the plagiarism check results to another mailbox (different from your login email).",
    "mode.app.additionalEmailInvalid": "The \"Additional email\" address is not a valid email format.",
    "mode.app.emailLabel": "Email",
    "mode.app.emailRequiredHint": "required",
    "mode.app.emailPlaceholder": "e.g. name@school.edu.vn",
    "mode.app.loginToAutofill": "Log in to the site hosting this app to auto-fill your email.",
    "mode.app.uploadFollowsAccount": "On the university portal, uploads are usually tied to the logged-in account.",
    "mode.app.needValidEmail": "Enter a valid email (e.g. name@neu.edu.vn) to upload files and run the check.",
    "mode.app.additionalEmailLabel2": "Additional email to receive results (optional)",
    "mode.app.additionalEmailHint2": "copy to an address other than the primary email",
    "mode.app.additionalEmailPlaceholder2": "Leave blank to send only to the primary email above",
    "mode.app.additionalEmailHelp2": "Optional: send an additional copy of the plagiarism check results email to another address.",

    // Content section
    "content.title": "Content",
    "content.textLabel": "Text / request",
    "content.textPlaceholder": "Paste the content to check…",
    "content.attachmentsTitle": "Attachments",
    "content.attachmentsHint":
      "PDF or Word — drag & drop or \"Choose files\" (multiple files supported). Files are uploaded automatically; then click \"Start check\".",
    "content.chooseFiles": "Choose files",
    "content.startCheck": "Start check",
    "content.reset": "Reset",

    // Results section
    "results.title": "Result",
    "results.sentDocuments": "Documents submitted",
    "results.size": "Size:",
    "results.completedAt": "Completed at:",
    "results.uploadDuration": "Upload time:",
    "results.file": "File:",
    "results.tabsAriaLabel": "Report sections",
    "results.overviewTab": "Overview",
    "results.tabFallback": "Section {index}",
    "results.noResultYet":
      "No result yet. Enter text and/or upload a file, then \"Start check\". Icon at top right: help.",
    "results.checking": "Checking…",
    "results.uploading": "Uploading…",
    "results.checkFailed": "Check failed.",
    "results.receivedRequestSimple": "Request received. This page will update automatically once done (large documents may take a few minutes).",
    "results.receivedRequestEmailWithCopy":
      "Plagiarism check request received (results by email). The system will send the result email to {primary} and a copy to {additional} once done; this page updates automatically (large documents may take a few minutes).",
    "results.receivedRequestEmailKnown":
      "Plagiarism check request received (results by email). The system will send the result email to {email} once done; this page updates automatically (large documents may take a few minutes).",
    "results.receivedRequestEmailUnknown":
      "Plagiarism check request received (results by email). The system will send the result email once done; this page updates automatically (large documents may take a few minutes).",
    "results.processing": "Processing…",

    // Status badges
    "status.success": "Result ready",
    "status.error": "An error occurred",
    "status.completed": "Completed",
    "status.failed": "Unsuccessful",
    "status.processing": "Processing",
    "status.pending": "Pending",
    "status.queued": "Waiting in queue",
    "status.updating": "Updating…",

    // Help dialog
    "help.title": "Help",
    "help.close": "Close",
    "help.intro": "Submit text (box above) and/or a PDF/Word file. Text only, files only, or both are all fine.",
    "help.modeTitle": "Mode:",
    "help.modeBody":
      "\"Result directly\" — fast for short passages. \"Step-by-step processing\" — sends results by email (optionally with a PDF); requires a valid primary email. On AI Portal you can add an \"Additional email\" field to send a copy to another address.",
    "help.filesTitle": "Files:",
    "help.filesBody":
      "Drag & drop or \"Choose files\" — uploaded automatically. Uploading multiple times before checking accumulates the URLs. Formats: .pdf, .doc, .docx.",
    "help.afterResultTitle": "After a result exists:",
    "help.afterResultBody":
      "uploading a new file clears the previous result and keeps only the URLs of the newly uploaded batch (a new check round).",
    "help.startCheckTitle": "\"Start check\":",
    "help.startCheckBody": "sends the request (requires text or at least one uploaded file).",
    "help.resultTitle": "Result:",
    "help.resultBody":
      "markdown; multiple sections may appear as tabs. Leaving the text box empty when submitting hides the \"Direct text input\" tab if present. \"Reset\" — clears the session and refreshes the form.",
    "help.footer": "Close: X, click the overlay, or Escape. API / configuration: see the operator's documentation.",

    // Errors (App.tsx)
    "errors.needTextOrFile": "Text or at least one file is required.",
    "errors.additionalEmailInvalidFix": "Additional email is invalid — fix it or leave the \"Additional email\" field blank.",
    "errors.needTextOrFileWithHint": "Text or at least one file is required (drag & drop / choose a file to upload first).",
    "errors.stepModeNeedsEmail": "Step-by-step mode: enter a valid email (e.g. name@neu.edu.vn) or log in to the site.",
    "errors.onlyPdfOrWord": "Only PDF or Word files are supported (.pdf, .doc, .docx).",
    "errors.skippedInvalidFiles": "Skipped {count} file(s) with an unsupported format: {names}{ellipsis}.",
    "errors.stepModeNeedsEmailUpload": "Step-by-step mode: enter a valid email (e.g. name@neu.edu.vn) or log in to the site to upload files.",
    "errors.uploadFailed": "Upload failed.",
    "errors.serviceUnreachable": "Could not connect to the service. Please try again later.",
    "errors.checkUnsuccessful": "Check unsuccessful.",

    // Upload messages
    "upload.multipleFilesDone": "Uploaded {count} files.",
    "upload.singleFileDone": "Uploaded: {name}",

    // Email completion notices
    "email.completedWithCopy":
      "Done. The system has sent the plagiarism check result email to {primary} and a copy to {additional}. Please check your inbox and spam folder if you don't see it.",
    "email.completedPrimary":
      "Done. The system has sent the plagiarism check result email to {primary}. Please check your inbox and spam folder if you don't see it.",
    "email.completedUnknown":
      "Done. The system has sent the plagiarism check result email to the address used for this request. Please check your inbox and spam folder if you don't see it.",

    // api.ts error messages
    "api.error431":
      "Error 431: HTTP headers too large (usually caused by a login session cookie). This build does not send cookies for embedded API calls (/api/apps/…/v1/*, /metadata, /health). Reload the page, or re-run `npm run pack` and reinstall the app package.",
    "api.errorAuthRequired": "The API requires authentication. Please log in at daovan.neu.edu.vn or check your access permissions.",
    "api.requestFailedStatus": "Request failed with status {status}",
    "api.cannotConnectBackend": "Could not connect to the backend. Please check the API base configuration.",
    "api.backendUrlNotConfigured": "Backend URL is not configured.",
    "api.uploadOriginUnknown": "Could not determine the upload address (open the app on a configured site or set VITE_PORTAL_ORIGIN).",
    "api.uploadFailedStatus": "Upload failed ({status})",
    "api.uploadNoFileUrl": "Upload did not return a file URL.",
    "api.reportPdfFetchFailed": "Could not download the PDF report.",
    "api.reportErrorStatus": "Error {status}",
    "api.reportJsonInsteadOfPdf": "API returned JSON instead of a PDF file.",
  },
  vi: {
    // Common
    "common.noContent": "Chưa có nội dung",

    // Header
    "header.title": "Kiểm tra đạo văn",
    "header.help": "Trợ giúp",

    // Mode section
    "mode.title": "Chế độ",
    "mode.chat.title": "Kết quả ngay trên trang",
    "mode.chat.desc": "Đoạn ngắn — thường vài giây đến vài chục giây.",
    "mode.app.title": "Xử lý từng bước",
    "mode.app.desc": "Tài liệu dài / nhiều tệp; kết quả gửi qua email (có thể kèm PDF). Cần email chính; có thể thêm email nhận bản sao.",
    "mode.app.resultSentTo": "Kết quả sẽ được gửi đến email",
    "mode.app.additionalEmailLabel": "Email nhận thêm kết quả (tuỳ chọn)",
    "mode.app.additionalEmailHintCopy": "bản sao tới địa chỉ khác",
    "mode.app.additionalEmailPlaceholder": "vd. hopkhac@truong.edu.vn — để trống nếu chỉ cần email đăng nhập",
    "mode.app.additionalEmailHelpLoggedIn":
      "Nhập nếu bạn muốn hệ thống gửi thêm bản sao kết quả kiểm tra đạo văn tới một hộp thư khác (khác email đăng nhập).",
    "mode.app.additionalEmailInvalid": "Địa chỉ «Email nhận thêm» chưa đúng định dạng email.",
    "mode.app.emailLabel": "Email",
    "mode.app.emailRequiredHint": "bắt buộc",
    "mode.app.emailPlaceholder": "Ví dụ: ten@truong.edu.vn",
    "mode.app.loginToAutofill": "Đăng nhập trang chứa app để tự điền email.",
    "mode.app.uploadFollowsAccount": "Trên cổng nhà trường, upload thường theo tài khoản đã đăng nhập.",
    "mode.app.needValidEmail": "Nhập email hợp lệ (vd. ten@neu.edu.vn) để tải tệp và kiểm tra.",
    "mode.app.additionalEmailLabel2": "Email nhận thêm kết quả (tuỳ chọn)",
    "mode.app.additionalEmailHint2": "bản sao tới địa chỉ khác email chính",
    "mode.app.additionalEmailPlaceholder2": "Để trống nếu chỉ gửi tới email chính ở trên",
    "mode.app.additionalEmailHelp2": "Tuỳ chọn: gửi thêm bản sao email kết quả kiểm tra đạo văn tới địa chỉ khác.",

    // Content section
    "content.title": "Nội dung",
    "content.textLabel": "Văn bản / yêu cầu",
    "content.textPlaceholder": "Dán nội dung cần kiểm tra…",
    "content.attachmentsTitle": "Tệp đính kèm",
    "content.attachmentsHint": "PDF hoặc Word — kéo thả hoặc «Chọn tệp» (nhiều file). Tự upload lên cổng; sau đó «Bắt đầu kiểm tra».",
    "content.chooseFiles": "Chọn tệp",
    "content.startCheck": "Bắt đầu kiểm tra",
    "content.reset": "Bắt đầu lại",

    // Results section
    "results.title": "Kết quả",
    "results.sentDocuments": "Tài liệu đã gửi",
    "results.size": "Dung lượng:",
    "results.completedAt": "Hoàn tất lúc:",
    "results.uploadDuration": "Thời gian upload:",
    "results.file": "Tệp:",
    "results.tabsAriaLabel": "Các phần báo cáo",
    "results.overviewTab": "Tổng quan",
    "results.tabFallback": "Mục {index}",
    "results.noResultYet": "Chưa có kết quả. Nhập văn bản và/hoặc tải tệp, rồi «Bắt đầu kiểm tra». Icon góc phải: trợ giúp.",
    "results.checking": "Đang kiểm tra…",
    "results.uploading": "Đang tải lên…",
    "results.checkFailed": "Kiểm tra thất bại.",
    "results.receivedRequestSimple": "Đã nhận yêu cầu. Trang tự cập nhật khi xong (tài liệu lớn có thể vài phút).",
    "results.receivedRequestEmailWithCopy":
      "Đã nhận yêu cầu kiểm tra đạo văn (gửi kết quả qua email). Hệ thống sẽ gửi email kết quả tới {primary} và bản sao tới {additional} khi hoàn tất; trang tự cập nhật trạng thái (tài liệu lớn có thể vài phút).",
    "results.receivedRequestEmailKnown":
      "Đã nhận yêu cầu kiểm tra đạo văn (gửi kết quả qua email). Hệ thống sẽ gửi email kết quả tới {email} khi hoàn tất; trang tự cập nhật trạng thái (tài liệu lớn có thể vài phút).",
    "results.receivedRequestEmailUnknown":
      "Đã nhận yêu cầu kiểm tra đạo văn (gửi kết quả qua email). Hệ thống sẽ gửi email kết quả khi hoàn tất; trang tự cập nhật trạng thái (tài liệu lớn có thể vài phút).",
    "results.processing": "Đang xử lý…",

    // Status badges
    "status.success": "Đã có kết quả",
    "status.error": "Có lỗi xảy ra",
    "status.completed": "Hoàn tất",
    "status.failed": "Không thành công",
    "status.processing": "Đang xử lý",
    "status.pending": "Đang chờ",
    "status.queued": "Đang chờ tới lượt",
    "status.updating": "Đang cập nhật",

    // Help dialog
    "help.title": "Trợ giúp",
    "help.close": "Đóng",
    "help.intro": "Gửi văn bản (ô bên trên) và/hoặc tệp PDF/Word. Chỉ văn bản, chỉ tệp, hoặc cả hai đều được.",
    "help.modeTitle": "Chế độ:",
    "help.modeBody":
      "«Kết quả ngay» — nhanh cho đoạn ngắn. «Xử lý từng bước» — gửi kết quả qua email (có thể kèm PDF); cần email chính hợp lệ. Trên AI Portal có thể thêm ô «Email nhận thêm» để gửi bản sao tới địa chỉ khác.",
    "help.filesTitle": "Tệp:",
    "help.filesBody": "Kéo thả hoặc «Chọn tệp» — tự upload lên cổng. Nhiều lần trước khi kiểm tra: URL được cộng dồn. Định dạng: .pdf, .doc, .docx.",
    "help.afterResultTitle": "Sau khi đã có kết quả:",
    "help.afterResultBody": "lần tải tệp mới xóa kết quả cũ và chỉ giữ URL của lô tệp vừa tải (lượt kiểm tra mới).",
    "help.startCheckTitle": "«Bắt đầu kiểm tra»:",
    "help.startCheckBody": "gửi yêu cầu (cần văn bản hoặc đã upload ít nhất một tệp).",
    "help.resultTitle": "Kết quả:",
    "help.resultBody":
      "markdown; nhiều mục có thể có tab. Ô văn bản để trống khi gửi → ẩn tab kiểu «Nội dung nhập trực tiếp» nếu có. «Bắt đầu lại» — xóa phiên, làm mới form.",
    "help.footer": "Đóng: X, bấm nền mờ, hoặc Escape. API / cấu hình: tài liệu đơn vị vận hành.",

    // Errors (App.tsx)
    "errors.needTextOrFile": "Cần có văn bản hoặc ít nhất một tệp.",
    "errors.additionalEmailInvalidFix": "Email nhận thêm không hợp lệ — sửa hoặc để trống ô «Email nhận thêm».",
    "errors.needTextOrFileWithHint": "Cần văn bản hoặc ít nhất một tệp (kéo thả / chọn tệp để tải lên trước).",
    "errors.stepModeNeedsEmail": "Chế độ từng bước: nhập email hợp lệ (vd. ten@neu.edu.vn) hoặc đăng nhập trang.",
    "errors.onlyPdfOrWord": "Chỉ hỗ trợ PDF hoặc Word (.pdf, .doc, .docx).",
    "errors.skippedInvalidFiles": "Bỏ qua {count} tệp không đúng định dạng: {names}{ellipsis}.",
    "errors.stepModeNeedsEmailUpload": "Chế độ từng bước: nhập email hợp lệ (vd. ten@neu.edu.vn) hoặc đăng nhập trang để tải lên.",
    "errors.uploadFailed": "Lỗi khi tải lên.",
    "errors.serviceUnreachable": "Không kết nối được dịch vụ. Thử lại sau.",
    "errors.checkUnsuccessful": "Kiểm tra không thành công.",

    // Upload messages
    "upload.multipleFilesDone": "Đã tải lên {count} tệp.",
    "upload.singleFileDone": "Đã tải lên: {name}",

    // Email completion notices
    "email.completedWithCopy":
      "Đã hoàn tất. Hệ thống đã gửi email kết quả kiểm tra đạo văn tới {primary} và đã gửi bản sao tới {additional}. Vui lòng kiểm tra hộp thư đến và mục spam nếu không thấy thư.",
    "email.completedPrimary":
      "Đã hoàn tất. Hệ thống đã gửi email kết quả kiểm tra đạo văn tới {primary}. Vui lòng kiểm tra hộp thư đến và mục spam nếu không thấy thư.",
    "email.completedUnknown":
      "Đã hoàn tất. Hệ thống đã gửi email kết quả kiểm tra đạo văn tới địa chỉ đã dùng cho yêu cầu này. Vui lòng kiểm tra hộp thư đến và mục spam nếu không thấy thư.",

    // api.ts error messages
    "api.error431":
      "Lỗi 431: header HTTP quá lớn (thường do cookie phiên đăng nhập). Bản hiện tại không gửi cookie cho API nhúng (/api/apps/…/v1/*, /metadata, /health). Tải lại trang hoặc chạy lại `npm run pack` và cài lại gói ứng dụng.",
    "api.errorAuthRequired": "API yêu cầu xác thực. Hãy đăng nhập daovan.neu.edu.vn hoặc kiểm tra quyền truy cập.",
    "api.requestFailedStatus": "Yêu cầu thất bại (mã {status})",
    "api.cannotConnectBackend": "Không thể kết nối backend. Hãy kiểm tra cấu hình API base.",
    "api.backendUrlNotConfigured": "Chưa cấu hình backend URL.",
    "api.uploadOriginUnknown": "Không xác định được địa chỉ upload (mở ứng dụng trong trang đã cấu hình hoặc đặt VITE_PORTAL_ORIGIN).",
    "api.uploadFailedStatus": "Upload thất bại ({status})",
    "api.uploadNoFileUrl": "Upload không trả về URL file.",
    "api.reportPdfFetchFailed": "Không tải được báo cáo PDF.",
    "api.reportErrorStatus": "Lỗi {status}",
    "api.reportJsonInsteadOfPdf": "API trả JSON thay vì file PDF.",
  },
}

export function t(key: string, params?: Record<string, string | number>): string {
  const locale = getLocale()
  const raw = messages[locale][key] ?? messages.en[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  )
}
