/**
 * Prepares engine assets for static hosting:
 *  - gzips heavy WASM/data binaries (transfer efficiency)
 *  - splits any file > PART_SIZE into chunks (Cloudflare Pages 25 MiB per-file limit)
 *  - writes public/engines/manifest.json consumed by src/engines/chunkLoader.ts
 *  - generates public/fixtures/sample.docx (minimal Word document for tests)
 *
 * Idempotent: skips work when outputs are newer than all sources.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { zipSync } from 'fflate'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'engines')
const fixturesDir = join(root, 'public', 'fixtures')
const manifestPath = join(outDir, 'manifest.json')

const PART_SIZE = 16 * 1024 * 1024 // 16 MiB — comfortably under the 25 MiB Pages limit
const MAX_ASSET_SIZE = 25 * 1024 * 1024

const sources = [
  {
    key: 'ffmpeg.coreJs',
    src: 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js',
    out: 'ffmpeg/ffmpeg-core.js',
    type: 'text/javascript',
    gzip: false,
  },
  {
    key: 'ffmpeg.coreWasm',
    src: 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
    out: 'ffmpeg/ffmpeg-core.wasm',
    type: 'application/wasm',
    gzip: true,
  },
  {
    key: 'lo.sofficeJs',
    src: 'node_modules/@matbee/libreoffice-converter/wasm/soffice.js',
    out: 'libreoffice/soffice.js',
    type: 'text/javascript',
    gzip: false,
  },
  {
    key: 'lo.sofficeWorkerJs',
    src: 'node_modules/@matbee/libreoffice-converter/wasm/soffice.worker.js',
    out: 'libreoffice/soffice.worker.js',
    type: 'text/javascript',
    gzip: false,
  },
  {
    key: 'lo.sofficeWasm',
    src: 'node_modules/@matbee/libreoffice-converter/wasm/soffice.wasm',
    out: 'libreoffice/soffice.wasm',
    type: 'application/wasm',
    gzip: true,
  },
  {
    key: 'lo.sofficeData',
    src: 'node_modules/@matbee/libreoffice-converter/wasm/soffice.data',
    out: 'libreoffice/soffice.data',
    type: 'application/octet-stream',
    gzip: true,
  },
  {
    key: 'lo.browserWorker',
    src: 'node_modules/@matbee/libreoffice-converter/dist/browser.worker.global.js',
    out: 'libreoffice/browser.worker.js',
    type: 'text/javascript',
    gzip: false,
  },
]

function log(msg) {
  console.log(`[prepare-engines] ${msg}`)
}

function isFresh() {
  if (!existsSync(manifestPath)) return false
  const manifestMtime = statSync(manifestPath).mtimeMs
  for (const s of sources) {
    const srcPath = join(root, s.src)
    if (!existsSync(srcPath)) throw new Error(`Missing source: ${s.src}`)
    if (statSync(srcPath).mtimeMs > manifestMtime) return false
  }
  // all manifest-referenced outputs must exist
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    for (const asset of Object.values(manifest.assets)) {
      for (const part of asset.parts) {
        if (!existsSync(join(root, 'public', part.path))) return false
      }
    }
  } catch {
    return false
  }
  if (!existsSync(join(fixturesDir, 'sample.docx'))) return false
  return true
}

function buildFixture() {
  mkdirSync(fixturesDir, { recursive: true })
  const docXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t>LocalConv sample document - 本地文件转换测试</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Second paragraph for conversion checks.</w:t></w:r></w:p></w:body></w:document>'
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>'
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>'
  const files = {
    '[Content_Types].xml': Buffer.from(contentTypes),
    '_rels/.rels': Buffer.from(rels),
    'word/document.xml': Buffer.from(docXml),
  }
  const zipped = zipSync(files, { level: 6 })
  writeFileSync(join(fixturesDir, 'sample.docx'), zipped)
  log(`fixture: public/fixtures/sample.docx (${zipped.length} bytes)`)
}

function hash(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16)
}

function prepareAsset(spec) {
  const srcPath = join(root, spec.src)
  const raw = readFileSync(srcPath)
  const outBase = join(outDir, spec.out)
  mkdirSync(dirname(outBase), { recursive: true })

  // remove any stale parts of previous runs
  const dir = dirname(outBase)
  const baseName = spec.out.split('/').pop()
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    if (f.startsWith(baseName)) rmSync(join(dir, f), { force: true })
  }

  const data = spec.gzip ? gzipSync(raw, { level: 6 }) : raw
  const parts = []
  if (data.length <= PART_SIZE) {
    writeFileSync(outBase, data)
    parts.push({
      path: `engines/${spec.out}`,
      bytes: data.length,
      sha: hash(data),
    })
  } else {
    const total = Math.ceil(data.length / PART_SIZE)
    for (let i = 0; i < total; i++) {
      const slice = data.subarray(i * PART_SIZE, Math.min((i + 1) * PART_SIZE, data.length))
      const partPath = `${spec.out}.part-${String(i).padStart(3, '0')}`
      writeFileSync(join(outDir, partPath), slice)
      if (slice.length > MAX_ASSET_SIZE) throw new Error(`${partPath} exceeds 25 MiB`)
      parts.push({ path: `engines/${partPath}`, bytes: slice.length, sha: hash(slice) })
    }
  }

  return {
    type: spec.type,
    gzip: spec.gzip,
    rawBytes: raw.length,
    storedBytes: data.length,
    sha: hash(raw),
    parts,
  }
}

async function main() {
  if (isFresh()) {
    log('up to date, skipping')
    return
  }
  const t0 = Date.now()
  const assets = {}
  for (const spec of sources) {
    const t = Date.now()
    const asset = prepareAsset(spec)
    assets[spec.key] = asset
    log(
      `${spec.key}: raw ${(asset.rawBytes / 1e6).toFixed(1)} MB -> stored ` +
        `${(asset.storedBytes / 1e6).toFixed(1)} MB in ${asset.parts.length} part(s) [${Date.now() - t} ms]`,
    )
  }
  const manifest = { version: 1, assets }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  buildFixture()
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

await main()
