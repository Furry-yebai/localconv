import type { ConversionOptions, ConversionResult, WorkerBrowserConverter } from '@matbee/libreoffice-converter/browser'
import { WorkerBrowserConverter as Converter } from '@matbee/libreoffice-converter/browser'
import { aggregateProgress, resolveAsset } from './chunkLoader'
import type { EngineLoadProgress } from './ffmpegEngine'

const ASSET_KEYS = [
  'lo.browserWorker',
  'lo.sofficeJs',
  'lo.sofficeWorkerJs',
  'lo.sofficeWasm',
  'lo.sofficeData',
] as const

let converterPromise: Promise<WorkerBrowserConverter> | null = null

export function getLibreOffice(onProgress?: EngineLoadProgress): Promise<WorkerBrowserConverter> {
  if (!converterPromise) {
    converterPromise = (async () => {
      const fns = await aggregateProgress([...ASSET_KEYS], onProgress)
      const [browserWorkerJs, sofficeJs, sofficeWorkerJs, sofficeWasm, sofficeData] = await Promise.all([
        resolveAsset('lo.browserWorker', fns['lo.browserWorker']),
        resolveAsset('lo.sofficeJs', fns['lo.sofficeJs']),
        resolveAsset('lo.sofficeWorkerJs', fns['lo.sofficeWorkerJs']),
        resolveAsset('lo.sofficeWasm', fns['lo.sofficeWasm']),
        resolveAsset('lo.sofficeData', fns['lo.sofficeData']),
      ])
      const converter = new Converter({
        browserWorkerJs,
        sofficeJs,
        sofficeWasm,
        sofficeData,
        sofficeWorkerJs,
      })
      await converter.initialize()
      return converter
    })()
    converterPromise.catch(() => {
      converterPromise = null
    })
  }
  return converterPromise
}

export function isLibreOfficeLoaded(): boolean {
  return converterPromise !== null
}

export interface DocTask {
  input: Uint8Array
  filename: string
  options: ConversionOptions
}

let queue: Promise<unknown> = Promise.resolve()

/** Serializes conversions — LibreOffice runs one document job at a time. */
export function runLibreOffice(task: DocTask, onProgress?: EngineLoadProgress): Promise<ConversionResult> {
  const run = queue.then(async () => {
    const converter = await getLibreOffice(onProgress)
    return converter.convert(task.input, task.options, task.filename)
  })
  queue = run.catch(() => undefined)
  return run
}
