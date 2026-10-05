export interface ProbeStream {
  type: 'video' | 'audio' | 'subtitle' | 'data' | 'attachment' | string
  codec?: string
  width?: number
  height?: number
}

export interface ProbeResult {
  streams: ProbeStream[]
  duration?: number
}

const STREAM_RE = /Stream #\d+:\d+.*?: (Video|Audio|Subtitle|Data|Attachment): ([A-Za-z0-9_]+)/
const SIZE_RE = /(\d{2,5})x(\d{2,5})/
const DURATION_RE = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/

/** Parses the header info printed by `ffmpeg -i` (stderr). */
export function parseProbeInfo(text: string): ProbeResult {
  const streams: ProbeStream[] = []
  let duration: number | undefined

  const dur = DURATION_RE.exec(text)
  if (dur) {
    duration = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])
  }

  for (const line of text.split(/\r?\n/)) {
    const m = STREAM_RE.exec(line)
    if (!m) continue
    const stream: ProbeStream = { type: m[1].toLowerCase(), codec: m[2].toLowerCase() }
    if (stream.type === 'video') {
      const size = SIZE_RE.exec(line)
      if (size) {
        stream.width = Number(size[1])
        stream.height = Number(size[2])
      }
    }
    streams.push(stream)
  }

  if (streams.length === 0) {
    const short = text.trim().split(/\r?\n/).slice(-3).join(' | ')
    throw new Error(`无法解析媒体文件（未识别到音视频流）：${short.slice(0, 200)}`)
  }
  return { streams, duration }
}
