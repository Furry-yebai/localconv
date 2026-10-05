import type { ConversionJob, ConversionOutcome } from '../../dispatch/converters'
import { baseName, extName } from '../../dispatch/converters'
import { getFFmpeg, runFFmpegSession } from '../../engines/ffmpegEngine'
import { parseProbeInfo, type ProbeResult, type ProbeStream } from '../../engines/probe'

export type VideoMode = 'smart' | 'remux' | 'compress' | 'audio'
export type VideoContainer = 'mp4' | 'mkv' | 'webm' | 'mov'
export type ExtractFormat = 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav'
export type Resolution = 'source' | '1080' | '720' | '480'
export type Quality = 'high' | 'balanced' | 'small'

export interface VideoOptions {
  mode: VideoMode
  container: VideoContainer
  extractFormat: ExtractFormat
  resolution: Resolution
  quality: Quality
}

export const VIDEO_CONTAINERS: { id: VideoContainer; label: string }[] = [
  { id: 'mp4', label: 'MP4（通用）' },
  { id: 'mkv', label: 'MKV（全能容器）' },
  { id: 'webm', label: 'WebM（网页）' },
  { id: 'mov', label: 'MOV（QuickTime）' },
]

export const EXTRACT_FORMATS: { id: ExtractFormat; label: string }[] = [
  { id: 'mp3', label: 'MP3' },
  { id: 'm4a', label: 'M4A / AAC' },
  { id: 'opus', label: 'Opus' },
  { id: 'flac', label: 'FLAC（无损）' },
  { id: 'wav', label: 'WAV（无损）' },
]

const CRF: Record<Quality, string> = { high: '20', balanced: '23', small: '28' }
// VP9 is broken in the upstream ffmpeg.wasm build (hangs / memory OOB),
// so WebM re-encodes use VP8 with a resolution-aware bitrate.
// bits per pixel per frame (assumes ~30 fps)
const VP8_BPP: Record<Quality, number> = { high: 0.12, balanced: 0.08, small: 0.05 }
const QUALITY_LABEL: Record<Quality, string> = { high: '高质量', balanced: '均衡', small: '最小体积' }

const EXTRACT_AUDIO: Record<ExtractFormat, { args: string[]; mime: string }> = {
  mp3: { args: ['-c:a', 'libmp3lame', '-b:a', '192k'], mime: 'audio/mpeg' },
  m4a: { args: ['-c:a', 'aac', '-b:a', '192k'], mime: 'audio/mp4' },
  opus: { args: ['-c:a', 'libopus', '-b:a', '128k'], mime: 'audio/opus' },
  flac: { args: ['-c:a', 'flac'], mime: 'audio/flac' },
  wav: { args: ['-c:a', 'pcm_s16le'], mime: 'audio/wav' },
}

/** 'any' means every codec of that type is accepted by the container. */
type CodecSet = Set<string> | 'any'

const COPY_VIDEO: Record<VideoContainer, CodecSet> = {
  mp4: new Set(['h264', 'hevc', 'mpeg4', 'av1']),
  mov: new Set(['h264', 'hevc', 'mpeg4', 'av1', 'mpeg2video', 'prores']),
  webm: new Set(['vp8', 'vp9', 'av1']),
  mkv: 'any',
}

const COPY_AUDIO: Record<VideoContainer, CodecSet> = {
  mp4: new Set(['aac', 'mp3', 'ac3', 'eac3', 'alac']),
  mov: new Set(['aac', 'mp3', 'ac3', 'alac', 'pcm_s16le', 'pcm_s24le']),
  webm: new Set(['opus', 'vorbis']),
  mkv: 'any',
}

const COPY_SUB: Record<VideoContainer, CodecSet> = {
  mp4: new Set(['mov_text', 'tx3g']),
  mov: new Set(['mov_text', 'tx3g']),
  webm: new Set(['webvtt']),
  mkv: 'any',
}

const TEXT_SUB = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'ttml', 'text'])
const MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024

function accepts(set: CodecSet, codec: string | undefined): boolean {
  if (set === 'any') return true
  return codec !== undefined && set.has(codec)
}

function canCopy(container: VideoContainer, streams: ProbeStream[]): boolean {
  for (const s of streams) {
    switch (s.type) {
      case 'video':
        if (s.codec === 'mjpeg' || s.codec === 'png') continue // attached cover art: mp4/mov ok-ish, keep conservative below
        if (!accepts(COPY_VIDEO[container], s.codec)) return false
        break
      case 'audio':
        if (!accepts(COPY_AUDIO[container], s.codec)) return false
        break
      case 'subtitle':
        if (!accepts(COPY_SUB[container], s.codec)) return false
        break
      case 'data':
      case 'attachment':
        if (container !== 'mkv') return false
        break
    }
  }
  return true
}

function faststart(container: VideoContainer): string[] {
  return container === 'mp4' || container === 'mov' ? ['-movflags', '+faststart'] : []
}

function defaultEncodeAudio(container: VideoContainer): string[] {
  switch (container) {
    case 'webm':
      return ['-c:a', 'libopus', '-b:a', '128k']
    case 'mkv':
      return ['-c:a', 'copy']
    case 'mp4':
    case 'mov':
      return ['-c:a', 'aac', '-b:a', '192k']
  }
}

interface Plan {
  args: string[]
  remux: boolean
  warnings: string[]
  outputName: string
}

function buildPlan(
  opts: VideoOptions,
  probe: ProbeResult,
  inputName: string,
): Plan {
  const streams = probe.streams
  const hasVideo = streams.some((s) => s.type === 'video' && !isCoverArt(s))
  const hasAudio = streams.some((s) => s.type === 'audio')
  const subs = streams.filter((s) => s.type === 'subtitle')
  const warnings: string[] = []

  // ---- audio extraction ----
  if (opts.mode === 'audio') {
    if (!hasAudio) throw new Error('该文件没有音轨，无法提取音频')
    const fmt = opts.extractFormat
    const outputName = `output.${fmt}`
    const args = [
      '-i',
      inputName,
      '-map',
      '0:a:0',
      '-vn',
      ...EXTRACT_AUDIO[fmt].args,
      ...(fmt === 'm4a' ? ['-movflags', '+faststart'] : []),
      outputName,
    ]
    return { args, remux: false, warnings, outputName }
  }

  const container = opts.container
  const outputName = `output.${container}`

  // ---- explicit remux ----
  if (opts.mode === 'remux') {
    if (!canCopy(container, streams)) {
      const blockers = incompatibleSummary(container, streams)
      throw new Error(
        `无法在不重编码的情况下转换到 ${container.toUpperCase()}：${blockers}。请改用“智能转换”或“压缩重编码”。`,
      )
    }
    const args = insertHevcTag(
      ['-i', inputName, '-map', '0', '-c', 'copy', ...faststart(container), outputName],
      streams,
      container,
    )
    return { args, remux: true, warnings, outputName }
  }

  // ---- smart: remux when possible ----
  if (opts.mode === 'smart' && canCopy(container, streams)) {
    const args = insertHevcTag(
      ['-i', inputName, '-map', '0', '-c', 'copy', ...faststart(container), outputName],
      streams,
      container,
    )
    return { args, remux: true, warnings, outputName }
  }

  // ---- compress / smart fallback: re-encode ----
  const args: string[] = ['-i', inputName]
  const firstVideo = streams.find((s) => s.type === 'video')

  if (hasVideo) {
    args.push('-map', '0:v:0')
    const targetH = opts.resolution === 'source' ? undefined : Number(opts.resolution)
    const srcH = firstVideo?.height
    const srcW = firstVideo?.width

    if (container === 'webm') {
      let w = srcW ?? 1280
      let h = srcH ?? 720
      if (targetH && h > targetH) {
        w = Math.max(2, Math.round((w * targetH) / h / 2) * 2)
        h = targetH
      }
      const bitrate = Math.max(150_000, Math.min(Math.round(w * h * 30 * VP8_BPP[opts.quality]), 12_000_000))
      args.push(
        '-c:v',
        'libvpx',
        '-b:v',
        String(bitrate),
        '-deadline',
        'good',
        '-cpu-used',
        '4',
        '-pix_fmt',
        'yuv420p',
      )
    } else {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', CRF[opts.quality], '-pix_fmt', 'yuv420p')
    }

    let vf: string | undefined
    if (targetH && srcH && srcH > targetH) {
      vf = `scale=-2:${targetH}`
    } else if ((srcW && srcW % 2 === 1) || (srcH && srcH % 2 === 1)) {
      vf = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
    }
    if (vf) args.push('-vf', vf)
  }

  if (hasAudio) {
    args.push('-map', '0:a')
    const audioSet = COPY_AUDIO[container]
    const audioCopyable = streams
      .filter((s) => s.type === 'audio')
      .every((s) => accepts(audioSet, s.codec))
    args.push(...(audioCopyable ? ['-c:a', 'copy'] : defaultEncodeAudio(container)))
  }

  if (subs.length > 0) {
    if (container === 'mkv') {
      args.push('-map', '0:s', '-c:s', 'copy')
    } else if (container === 'mp4' || container === 'mov') {
      if (subs.every((s) => TEXT_SUB.has(s.codec ?? ''))) {
        args.push('-map', '0:s', '-c:s', 'mov_text')
      } else {
        warnings.push('字幕已丢弃：位图字幕无法写入 MP4/MOV')
      }
    } else {
      warnings.push('字幕已丢弃：WebM 不支持该字幕格式')
    }
  }

  if (!hasVideo && !hasAudio) throw new Error('文件中没有可转换的音视频流')

  args.push(...faststart(container), outputName)
  return { args, remux: false, warnings, outputName }
}

function isCoverArt(s: ProbeStream): boolean {
  // Attached pictures show up as mjpeg/png video streams without sensible size.
  return s.type === 'video' && (s.codec === 'mjpeg' || s.codec === 'png') && !s.width
}

function insertHevcTag(args: string[], streams: ProbeStream[], container: VideoContainer): string[] {
  if (container !== 'mp4' && container !== 'mov') return args
  if (!streams.some((s) => s.type === 'video' && s.codec === 'hevc')) return args
  const out = [...args]
  const idx = out.lastIndexOf('-c')
  out.splice(idx + 2, 0, '-tag:v', 'hvc1')
  return out
}

function incompatibleSummary(container: VideoContainer, streams: ProbeStream[]): string {
  const parts: string[] = []
  const videoBad = streams.filter(
    (s) => s.type === 'video' && !isCoverArt(s) && !accepts(COPY_VIDEO[container], s.codec),
  )
  const audioBad = streams.filter((s) => s.type === 'audio' && !accepts(COPY_AUDIO[container], s.codec))
  const subBad = streams.filter((s) => s.type === 'subtitle' && !accepts(COPY_SUB[container], s.codec))
  const extra = streams.filter((s) => (s.type === 'data' || s.type === 'attachment') && container !== 'mkv')
  if (videoBad.length) parts.push(`视频编码 ${videoBad[0].codec} 不被 ${container.toUpperCase()} 支持`)
  if (audioBad.length) parts.push(`音频编码 ${audioBad[0].codec} 不被 ${container.toUpperCase()} 支持`)
  if (subBad.length) parts.push(`字幕 ${subBad[0].codec} 不被 ${container.toUpperCase()} 支持`)
  if (extra.length) parts.push('文件包含附加数据流')
  return parts.join('；') || '存在不兼容的流'
}

export async function convertVideo(job: ConversionJob): Promise<ConversionOutcome> {
  const opts = job.options as unknown as VideoOptions

  if (job.file.size > MAX_INPUT_BYTES) {
    throw new Error('文件超过 2 GB，浏览器内存可能不足，请先分割文件或选择更小的素材')
  }

  job.onProgress(-1, '下载视频引擎…')
  await getFFmpeg((ratio, label) => job.onProgress(ratio, `下载视频引擎…（${label}）`))

  const inputName = `input.${extName(job.file.name) || 'bin'}`
  const data = new Uint8Array(await job.file.arrayBuffer())

  return runFFmpegSession(
    [{ name: inputName, data }],
    {
      onProgress: (ratio) => job.onProgress(ratio, '转码中…'),
      onLog: (line) => console.debug('[ffmpeg]', line),
    },
    async ({ ff, startCapture, endCapture }) => {
      // ---- probe: input buffer is owned by the WASM fs from here on ----
      job.onProgress(-1, '解析媒体信息…')
      startCapture()
      await ff.exec(['-hide_banner', '-i', inputName])
      const probe = parseProbeInfo(endCapture())

      const plan = buildPlan(opts, probe, inputName)
      const suffix = opts.mode === 'audio' ? opts.extractFormat : opts.container
      const mime =
        opts.mode === 'audio' ? EXTRACT_AUDIO[opts.extractFormat].mime : mimeForContainer(opts.container)

      job.onProgress(-1, plan.remux ? '重新封装中（不重编码，很快）…' : encodeLabel(opts))

      const code = await ff.exec(plan.args)
      if (code !== 0) {
        throw new Error(`ffmpeg 退出码 ${code}（命令：ffmpeg ${plan.args.join(' ')}）`)
      }

      const output = await ff.readFile(plan.outputName)
      if (typeof output === 'string') {
        throw new Error(`ffmpeg 输出 ${plan.outputName} 不是二进制数据`)
      }
      job.onProgress(1, '完成')

      return {
        blob: new Blob([new Uint8Array(output) as BlobPart], { type: mime }),
        filename: `${baseName(job.file.name)}.${suffix}`,
        warnings: plan.warnings.length ? plan.warnings : undefined,
      }
    },
  )
}

function encodeLabel(opts: VideoOptions): string {
  if (opts.mode === 'audio') return '提取音轨…'
  if (opts.mode === 'compress') return `重编码中（${QUALITY_LABEL[opts.quality]}）…`
  return '转码中…'
}

function mimeForContainer(c: VideoContainer): string {
  switch (c) {
    case 'mp4':
      return 'video/mp4'
    case 'mkv':
      return 'video/x-matroska'
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
  }
}
