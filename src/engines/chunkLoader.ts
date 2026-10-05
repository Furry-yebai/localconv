/**
 * Chunked engine asset loader.
 *
 * Engines (ffmpeg.wasm, LibreOffice WASM) ship binaries far larger than the
 * 25 MiB per-asset limit of Cloudflare Pages. scripts/prepare-engines.mjs
 * gzips them and splits into <16 MiB parts; this module reassembles parts,
 * gunzips via DecompressionStream, and hands back object URLs that the
 * engines accept transparently (their loaders only need a fetchable URL).
 *
 * All bytes stay in the browser. Parts are HTTP-cached by the browser
 * (Cache-Control: immutable set in public/_headers), so repeat visits skip
 * the download entirely.
 */

export interface AssetPart {
  path: string
  bytes: number
  sha: string
}

export interface EngineAsset {
  type: string
  gzip: boolean
  rawBytes: number
  storedBytes: number
  sha: string
  parts: AssetPart[]
}

export interface EngineManifest {
  version: number
  assets: Record<string, EngineAsset>
}

export type ProgressFn = (loadedBytes: number, totalBytes: number) => void

let manifestPromise: Promise<EngineManifest> | null = null

export function getManifest(): Promise<EngineManifest> {
  if (!manifestPromise) {
    // no-cache: /engines/* is served immutable for a year, but the manifest must
    // revalidate so a repacked engine set can never be served stale.
    manifestPromise = fetch('/engines/manifest.json', { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`)
      return r.json() as Promise<EngineManifest>
    })
  }
  return manifestPromise
}

const resolvedUrls = new Map<string, string>()

async function fetchPart(path: string, expectedBytes: number, onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  const reader = res.body?.getReader()
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer())
    onBytes(buf.byteLength)
    return buf
  }
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.byteLength
      onBytes(value.byteLength)
    }
  }
  if (received !== expectedBytes) {
    // Not fatal (encoding could alter framing), but worth surfacing in logs.
    console.warn(`[chunkLoader] ${path}: expected ${expectedBytes} bytes, got ${received}`)
  }
  const out = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('浏览器不支持 DecompressionStream，无法加载转换引擎（需要较新版本的 Chrome/Edge/Firefox/Safari）')
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Resolves an engine asset to a fetchable object URL, downloading and
 * assembling its parts on first use. Concurrent calls for the same asset
 * share one download.
 */
export function resolveAsset(key: string, onProgress?: ProgressFn): Promise<string> {
  const cached = resolvedUrls.get(key)
  if (cached) return Promise.resolve(cached)

  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const manifest = await getManifest()
    const asset = manifest.assets[key]
    if (!asset) throw new Error(`Unknown engine asset: ${key}`)

    const total = asset.storedBytes
    let loaded = 0
    const report = (delta: number) => {
      loaded += delta
      onProgress?.(Math.min(loaded, total), total)
    }
    onProgress?.(0, total)

    // Fetch parts (max 3 in parallel — few parts per asset anyway).
    const results: Uint8Array[] = new Array(asset.parts.length)
    let next = 0
    const workers = Array.from({ length: Math.min(3, asset.parts.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= asset.parts.length) return
        results[i] = await fetchPart(asset.parts[i].path, asset.parts[i].bytes, report)
      }
    })
    await Promise.all(workers)

    let bytes: Uint8Array
    if (asset.parts.length === 1) {
      bytes = results[0]
    } else {
      bytes = new Uint8Array(asset.storedBytes)
      let offset = 0
      for (const part of results) {
        bytes.set(part, offset)
        offset += part.byteLength
      }
    }

    if (asset.gzip) bytes = await gunzip(bytes)
    if (bytes.byteLength !== asset.rawBytes) {
      console.warn(`[chunkLoader] ${key}: expected ${asset.rawBytes} raw bytes, got ${bytes.byteLength}`)
    }

    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: asset.type }))
    resolvedUrls.set(key, url)
    inFlight.delete(key)
    return url
  })()

  inFlight.set(key, promise)
  // On failure allow retry.
  promise.catch(() => inFlight.delete(key))
  return promise
}

const inFlight = new Map<string, Promise<string>>()

/** Combines several asset progress callbacks into one 0..1 ratio. */
export async function aggregateProgress(
  keys: string[],
  onRatio?: (ratio: number, label: string) => void,
): Promise<Record<string, ProgressFn>> {
  const manifest = await getManifest()
  const totals = new Map<string, number>()
  let total = 0
  for (const key of keys) {
    const size = manifest.assets[key]?.storedBytes ?? 0
    totals.set(key, size)
    total += size
  }
  const loaded = new Map<string, number>(keys.map((k) => [k, 0]))
  const fns: Record<string, ProgressFn> = {}
  for (const key of keys) {
    fns[key] = (loadedBytes) => {
      loaded.set(key, loadedBytes)
      if (total > 0 && onRatio) {
        let s = 0
        for (const v of loaded.values()) s += v
        onRatio(Math.min(s / total, 1), key)
      }
    }
  }
  return fns
}
