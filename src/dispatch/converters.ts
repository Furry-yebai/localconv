import type { ModuleKind, OptionValue } from '../state/tasks'

export interface ConversionJob {
  file: File
  options: Record<string, OptionValue>
  onProgress: (ratio: number, label?: string) => void
}

export interface ConversionOutcome {
  blob: Blob
  filename: string
  warnings?: string[]
}

export type Converter = (job: ConversionJob) => Promise<ConversionOutcome>

import { convertAudio } from '../features/audio/convert'
import { convertDoc } from '../features/docs/convert'
import { convertVideo } from '../features/video/convert'

const registry: Record<ModuleKind, Converter> = {
  audio: convertAudio,
  video: convertVideo,
  doc: convertDoc,
}

export function runConversion(kind: ModuleKind, job: ConversionJob): Promise<ConversionOutcome> {
  const converter = registry[kind]
  if (!converter) throw new Error(`没有 ${kind} 转换器`)
  return converter(job)
}

/** Strips directory parts and extension from a filename. */
export function baseName(filename: string): string {
  const last = filename.split(/[\\/]/).pop() ?? filename
  const dot = last.lastIndexOf('.')
  return dot > 0 ? last.slice(0, dot) : last
}

/** Extension (lowercase, without dot); 'bin' when absent. */
export function extName(filename: string): string {
  const last = filename.split(/[\\/]/).pop() ?? filename
  const dot = last.lastIndexOf('.')
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : ''
}

export function uniqueFilename(filename: string, taken: Set<string>): string {
  if (!taken.has(filename)) {
    taken.add(filename)
    return filename
  }
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ''
  let i = 2
  while (taken.has(`${stem} (${i})${ext}`)) i++
  const out = `${stem} (${i})${ext}`
  taken.add(out)
  return out
}
