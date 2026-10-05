import { FFmpeg } from '@ffmpeg/ffmpeg'
import type { ProgressEventCallback } from '@ffmpeg/ffmpeg'
import { aggregateProgress, resolveAsset } from './chunkLoader'

export interface EngineLoadProgress {
  (ratio: number, label: string): void
}

let ffmpegPromise: Promise<FFmpeg> | null = null
let activeProgress: ((ratio: number) => void) | null = null
let activeLog: ((line: string) => void) | null = null

const onProgressEvent: ProgressEventCallback = ({ progress }) => {
  if (activeProgress && Number.isFinite(progress)) {
    activeProgress(Math.max(0, Math.min(progress, 1)))
  }
}

export function getFFmpeg(onProgress?: EngineLoadProgress): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const fns = await aggregateProgress(['ffmpeg.coreJs', 'ffmpeg.coreWasm'], onProgress)
      const [coreURL, wasmURL] = await Promise.all([
        resolveAsset('ffmpeg.coreJs', fns['ffmpeg.coreJs']),
        resolveAsset('ffmpeg.coreWasm', fns['ffmpeg.coreWasm']),
      ])
      const ff = new FFmpeg()
      ff.on('progress', onProgressEvent)
      ff.on('log', ({ message }) => activeLog?.(message))
      await ff.load({ coreURL, wasmURL })
      return ff
    })()
    ffmpegPromise.catch(() => {
      ffmpegPromise = null
    })
  }
  return ffmpegPromise
}

export function isFFmpegLoaded(): boolean {
  return ffmpegPromise !== null
}

export interface FFmpegTask {
  /** Input files to stage inside the WASM filesystem. */
  inputs: { name: string; data: Uint8Array }[]
  /** Arguments passed to ffmpeg.exec(). */
  args: string[]
  /** Output file name to read back from the WASM filesystem. */
  output: string
  onProgress?: (ratio: number) => void
  onLog?: (line: string) => void
}

let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn)
  queue = run.catch(() => undefined)
  return run
}

/**
 * Runs one ffmpeg task; concurrent calls are serialized on a single
 * engine instance (single WASM filesystem).
 *
 * Note: writeFile() transfers the underlying ArrayBuffer to the worker,
 * detaching it — inputs must not be reused after the call.
 */
export function runFFmpeg(task: FFmpegTask): Promise<Uint8Array> {
  return enqueue(async () => {
    const ff = await getFFmpeg()
    activeProgress = task.onProgress ?? null
    activeLog = task.onLog ?? null
    const staged: string[] = []
    try {
      for (const input of task.inputs) {
        await ff.writeFile(input.name, input.data)
        staged.push(input.name)
      }
      const code = await ff.exec(task.args)
      if (code !== 0) {
        throw new Error(`ffmpeg 退出码 ${code}（命令：ffmpeg ${task.args.join(' ')}）`)
      }
      const data = await ff.readFile(task.output)
      if (typeof data === 'string') {
        throw new Error(`ffmpeg 输出 ${task.output} 不是二进制数据`)
      }
      staged.push(task.output)
      task.onProgress?.(1)
      return new Uint8Array(data)
    } finally {
      activeProgress = null
      activeLog = null
      for (const name of staged) {
        try {
          await ff.deleteFile(name)
        } catch {
          /* best effort cleanup */
        }
      }
    }
  })
}

/** Writes binary data into the WASM fs, runs args, and returns named output. */
export async function runFFmpegText(task: FFmpegTask): Promise<string> {
  const bytes = await runFFmpeg(task)
  return new TextDecoder().decode(bytes)
}

export interface SessionControls {
  ff: FFmpeg
  /** Begins capturing log output (e.g. `ffmpeg -i` header info on stderr). */
  startCapture: () => void
  /** Stops capturing and returns everything captured since startCapture(). */
  endCapture: () => string
}

/**
 * Stages inputs once and hands the caller a serialized session — allows
 * several exec() calls (probe + convert) without re-writing files, which
 * would fail because writeFile() detaches the source buffer.
 */
export function runFFmpegSession<T>(
  inputs: { name: string; data: Uint8Array }[],
  hooks: { onProgress?: (ratio: number) => void; onLog?: (line: string) => void },
  fn: (ctl: SessionControls) => Promise<T>,
): Promise<T> {
  return enqueue(async () => {
    const ff = await getFFmpeg()
    activeProgress = hooks.onProgress ?? null
    let capturing = false
    let lines: string[] = []
    activeLog = (line) => {
      if (capturing) lines.push(line)
      hooks.onLog?.(line)
    }
    const staged: string[] = []
    try {
      for (const input of inputs) {
        await ff.writeFile(input.name, input.data)
        staged.push(input.name)
      }
      return await fn({
        ff,
        startCapture: () => {
          lines = []
          capturing = true
        },
        endCapture: () => {
          capturing = false
          return lines.join('\n')
        },
      })
    } finally {
      activeProgress = null
      activeLog = null
      for (const name of staged) {
        try {
          await ff.deleteFile(name)
        } catch {
          /* best effort cleanup */
        }
      }
    }
  })
}
