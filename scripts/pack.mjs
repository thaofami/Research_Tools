#!/usr/bin/env node
/**
 * Package PlagiarismChecker (frontend + backend) into zip for AI Portal.
 * Output:
 *  - dist/plagiarism-checker-app-package.zip
 *  - dist/plagiarism-checker-app-package-basepath.zip (when PACK_BASEPATH=1)
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { spawnSync } from "child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const outDir = path.join(root, "dist")
const stagingDir = path.join(root, ".pack-tmp")
const baseName = process.env.PACK_BASEPATH ? "plagiarism-checker-app-package-basepath" : "plagiarism-checker-app-package"
const outZip = path.join(outDir, `${baseName}.zip`)

const manifestPath = path.join(root, "package", "manifest.json")
const frontendDir = path.join(root, process.env.PACK_SOURCE || "public")
const backendSourcePath = path.join(root, "backend", "server.mjs")
const backendEmbedPath = path.join(root, "backend", "embed.mjs")
const backendPackagePath = path.join(root, "backend", "package.json")

function runZip(args, cwd, errorMessage) {
  const result = spawnSync("zip", args, { cwd, stdio: "inherit" })
  if (result.status !== 0) {
    console.error(errorMessage)
    process.exit(result.status ?? 1)
  }
}

function toPortalBackendPackage(raw) {
  const cloned = {
    ...raw,
    scripts: {
      start: "PLAGIARISM_CHECKER_RUNTIME=portal NODE_ENV=production node dist/embed.js",
    },
  }
  return cloned
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error("Missing package/manifest.json")
    process.exit(1)
  }
  if (!fs.existsSync(frontendDir) || !fs.existsSync(path.join(frontendDir, "index.html"))) {
    console.error("Missing frontend build in public/. Run: npm run build")
    process.exit(1)
  }
  if (!fs.existsSync(backendSourcePath)) {
    console.error("Missing backend/server.mjs")
    process.exit(1)
  }
  if (!fs.existsSync(backendEmbedPath)) {
    console.error("Missing backend/embed.mjs")
    process.exit(1)
  }
  if (!fs.existsSync(backendPackagePath)) {
    console.error("Missing backend/package.json")
    process.exit(1)
  }

  const backendRawPackage = JSON.parse(fs.readFileSync(backendPackagePath, "utf-8"))
  const portalBackendPackage = toPortalBackendPackage(backendRawPackage)

  fs.mkdirSync(outDir, { recursive: true })
  if (fs.existsSync(outZip)) fs.unlinkSync(outZip)
  fs.rmSync(stagingDir, { recursive: true, force: true })
  fs.mkdirSync(stagingDir, { recursive: true })

  fs.cpSync(frontendDir, path.join(stagingDir, "public"), { recursive: true })
  fs.mkdirSync(path.join(stagingDir, "dist"), { recursive: true })
  fs.copyFileSync(backendSourcePath, path.join(stagingDir, "dist", "server.js"))
  fs.copyFileSync(backendEmbedPath, path.join(stagingDir, "dist", "embed.js"))
  fs.copyFileSync(manifestPath, path.join(stagingDir, "manifest.json"))
  fs.writeFileSync(path.join(stagingDir, "package.json"), `${JSON.stringify(portalBackendPackage, null, 2)}\n`, "utf-8")

  runZip(["-r", outZip, "manifest.json", "package.json", "public", "dist"], stagingDir, "zip command failed.")

  fs.rmSync(stagingDir, { recursive: true, force: true })
  console.log("Created:", outZip)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
