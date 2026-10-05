import type { ConversionOptions, InputFormat, OutputFormat } from '@matbee/libreoffice-converter/browser'
import { EXTENSION_TO_FORMAT } from '@matbee/libreoffice-converter/browser'
import type { ConversionJob, ConversionOutcome } from '../../dispatch/converters'
import { baseName, extName } from '../../dispatch/converters'
import { runLibreOffice } from '../../engines/libreofficeEngine'

export type DocOutput = 'pdf' | 'docx' | 'txt' | 'html' | 'xlsx' | 'csv' | 'pptx'

export const DOC_OUTPUTS: { id: DocOutput; label: string }[] = [
  { id: 'pdf', label: 'PDF 文档（推荐，所有格式可转）' },
  { id: 'docx', label: 'Word 文档（.docx）' },
  { id: 'txt', label: '纯文本（.txt）' },
  { id: 'html', label: '网页（.html）' },
  { id: 'xlsx', label: 'Excel 表格（.xlsx）' },
  { id: 'csv', label: 'CSV 表格（.csv）' },
  { id: 'pptx', label: 'PowerPoint 演示（.pptx）' },
]

type DocCategory = 'text' | 'spreadsheet' | 'presentation' | 'drawing'

/**
 * Maps input extensions to their LibreOffice document category.
 * Mirrors desktop/source/libinit.cxx extension maps: only combinations
 * listed here are real saveAs filters, everything else errors early.
 */
const INPUT_CATEGORY: Record<string, DocCategory> = {
  doc: 'text',
  docx: 'text',
  odt: 'text',
  rtf: 'text',
  txt: 'text',
  html: 'text',
  htm: 'text',
  epub: 'text',
  xml: 'text',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
  odg: 'drawing',
  odf: 'drawing',
  pdf: 'drawing',
}

/** Valid UI outputs per input category (intersection with UI option list). */
const CATEGORY_OUTPUTS: Record<DocCategory, DocOutput[]> = {
  text: ['pdf', 'docx', 'txt', 'html'],
  spreadsheet: ['pdf', 'xlsx', 'csv', 'html'],
  presentation: ['pdf', 'pptx', 'html'],
  drawing: ['pdf'],
}

export function validOutputsForExt(ext: string): DocOutput[] {
  const category = INPUT_CATEGORY[ext]
  return category ? CATEGORY_OUTPUTS[category] : []
}

export async function convertDoc(job: ConversionJob): Promise<ConversionOutcome> {
  const output = (job.options.output as DocOutput) ?? 'pdf'
  const inputExt = extName(job.file.name)
  const inputFormat = EXTENSION_TO_FORMAT[inputExt]

  if (!inputFormat || !INPUT_CATEGORY[inputExt]) {
    throw new Error(`暂不支持的输入格式 .${inputExt || '(无扩展名)'}，支持 Office / ODF / PDF / 纯文本等文档`)
  }
  if (!validOutputsForExt(inputExt).includes(output)) {
    throw new Error(`暂不支持 .${inputExt} → .${output} 转换，可尝试 ${validOutputsForExt(inputExt).map((f) => `.${f}`).join(' / ')}`)
  }

  job.onProgress(-1, '下载文档引擎…（首次约 78 MB，之后走缓存）')
  const data = new Uint8Array(await job.file.arrayBuffer())

  const options: ConversionOptions = {
    outputFormat: output as OutputFormat,
    inputFormat: inputFormat as InputFormat,
  }

  const result = await runLibreOffice(
    { input: data, filename: job.file.name, options },
    (ratio) => {
      if (ratio >= 1) job.onProgress(-1, '初始化引擎并转换文档…')
      else job.onProgress(ratio, `下载文档引擎…（${Math.round(ratio * 100)}%）`)
    },
  )

  job.onProgress(1, '完成')
  const bytes = result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data as ArrayBuffer)
  return {
    blob: new Blob([bytes as BlobPart], { type: result.mimeType || 'application/octet-stream' }),
    filename: `${baseName(job.file.name)}.${output}`,
  }
}
