import { zip, type AsyncZippable } from 'fflate'

/**
 * Already-compressed media are stored (level 0) — deflate would burn CPU
 * for a few percent; text-ish outputs actually shrink.
 */
const STORE_EXTS = new Set([
  'mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus',
  'mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv', 'ts',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'pdf', 'zip', 'docx', 'xlsx', 'pptx',
])

function levelFor(filename: string): 0 | 6 {
  const dot = filename.lastIndexOf('.')
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
  return STORE_EXTS.has(ext) ? 0 : 6
}

/** Zips converted results into a single archive (files already read into memory). */
export async function zipBlobs(files: { name: string; blob: Blob }[]): Promise<Uint8Array> {
  const entries: AsyncZippable = {}
  for (const f of files) {
    entries[f.name] = [new Uint8Array(await f.blob.arrayBuffer()), { level: levelFor(f.name) }]
  }
  return new Promise((resolve, reject) => {
    zip(entries, (err, data) => (err ? reject(err) : resolve(data)))
  })
}
