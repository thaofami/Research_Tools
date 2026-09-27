import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

const embedBase = process.env.EMBED_BASE_PATH || "./"
const outDir = process.env.VITE_OUT_DIR || "public"

/** Mặc định proxy thẳng lên daovan để chỉ cần `npm run dev` (không bắt buộc backend :4270). Đặt PLAGIARISM_CHECKER_DEV_PROXY=http://127.0.0.1:4270 nếu muốn qua server.mjs. */
const plagiarismDevProxy = (process.env.PLAGIARISM_CHECKER_DEV_PROXY || "https://daovan.neu.edu.vn").trim()
const plagiarismProxyToLocalBackend = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(plagiarismDevProxy)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: embedBase,
  publicDir: false,
  server: {
    port: 3046,
    proxy: {
      "/plagiarism-api": {
        target: plagiarismDevProxy,
        changeOrigin: true,
        secure: plagiarismProxyToLocalBackend ? false : true,
        rewrite: plagiarismProxyToLocalBackend
          ? (p) => p
          : (p) => p.replace(/^\/plagiarism-api/, "/api/file-search/ai"),
      },
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
})
