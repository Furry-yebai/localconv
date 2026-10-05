import type { ConversionJob, ConversionOutcome } from '../../dispatch/converters'
import { baseName, extName } from '../../dispatch/converters'
import { getFFmpeg, runFFmpeg } from '../../engines/ffmpegEngine'

export type AudioFormat = 'mp3' | 'wav' | 'flac' | 'm4a' | 'ogg' | 'opus'

export const AUDIO_FORMATS: { id: AudioFormat; label: string; lossy: boolean }[] = [
  { id: 'mp3', label: 'MP3（通用）', lossy: true },
  { id: 'm4a', label: 'M4A / AAC（苹果生态）', lossy: true },
  { id: 'ogg', label: 'OGG Vorbis（开源）', lossy: true },
  { id: 'opus', label: 'Opus（高压缩率）', lossy: true },
  { id: 'flac', label: 'FLAC（无损压缩）', lossy: false },
  { id: 'wav', label: 'WAV（无损未压缩）', lossy: false },
]

export const BITRATES: Record<AudioFormat, string[]> = {
  mp3: ['128k', '192k', '256k', '320k'],
  m4a: ['96k', '128k', '192k', '256k'],
  ogg: ['96k', '128k', '192k', '256k'],
  opus: ['64k', '96k', '128k', '192k'],
  flac: [],
  wav: [],
}

export const AUDIO_MIME: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  flac: 'audio/flac',
  wav: 'audio/wav',
}

function buildArgs(format: AudioFormat, input: string, output: string, bitrate: string): string[] {
  switch (format) {
    case 'mp3':
      return ['-i', input, '-vn', '-c:a', 'libmp3lame', '-b:a', bitrate, output]
    case 'm4a':
      return ['-i', input, '-vn', '-c:a', 'aac', '-b:a', bitrate, output]
    case 'ogg':
      return ['-i', input, '-vn', '-c:a', 'libvorbis', '-b:a', bitrate, output]
    case 'opus':
      return ['-i', input, '-vn', '-c:a', 'libopus', '-b:a', bitrate, output]
    case 'flac':
      return ['-i', input, '-vn', '-c:a', 'flac', output]
    case 'wav':
      return ['-i', input, '-vn', '-c:a', 'pcm_s16le', output]
  }
}

export async function convertAudio(job: ConversionJob): Promise<ConversionOutcome> {
  const format = (job.options.format as AudioFormat) ?? 'mp3'
  const bitrate = (job.options.bitrate as string) ?? BITRATES[format][1] ?? '192k'

  job.onProgress(-1, '下载音频引擎…')
  await getFFmpeg((ratio, label) => job.onProgress(ratio, `下载音频引擎…（${label}）`))

  const inputExt = extName(job.file.name) || 'bin'
  const inputName = `input.${inputExt}`
  const outputName = `output.${format}`
  const data = new Uint8Array(await job.file.arrayBuffer())

  const output = await runFFmpeg({
    inputs: [{ name: inputName, data }],
    args: buildArgs(format, inputName, outputName, bitrate),
    output: outputName,
    onProgress: (ratio) => job.onProgress(ratio, '转换中…'),
    onLog: (line) => console.debug('[ffmpeg]', line),
  })

  return {
    blob: new Blob([output as BlobPart], { type: AUDIO_MIME[format] }),
    filename: `${baseName(job.file.name)}.${format}`,
  }
}
