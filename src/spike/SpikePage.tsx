import { useRef, useState } from 'react'
import { getFFmpeg, runFFmpeg } from '../engines/ffmpegEngine'
import { runLibreOffice } from '../engines/libreofficeEngine'

type Level = 'info' | 'ok' | 'err'

interface LogLine {
  level: Level
  text: string
}

/** Builds a 1-second 440 Hz mono 16-bit PCM WAV file entirely in JS. */
function makeSineWav(seconds = 1, sampleRate = 44100, freq = 440): Uint8Array {
  const numSamples = Math.floor(seconds * sampleRate)
  const dataSize = numSamples * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < numSamples; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sampleRate)
    view.setInt16(44 + i * 2, Math.round(v * 32000), true)
  }
  return new Uint8Array(buf)
}

export default function SpikePage() {
  const [lines, setLines] = useState<LogLine[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [loadRatio, setLoadRatio] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const log = (text: string, level: Level = 'info') => {
    setLines((prev) => [...prev, { level, text }])
    queueMicrotask(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    })
  }

  const testFFmpeg = async () => {
    setBusy('ffmpeg')
    try {
      log('开始加载 ffmpeg 引擎（首次约 10 MB，之后走缓存）...')
      const onProgress = (ratio: number, label: string) => {
        setLoadRatio(ratio)
        if (ratio >= 1) log(`引擎资产下载完成: ${label}`)
      }
      await getFFmpeg(onProgress)
      log('ffmpeg 引擎加载成功')

      // Dump available encoders for capability verification.
      const ff = await getFFmpeg()
      const encoders: string[] = []
      const collect = ({ message }: { message: string }) => encoders.push(message)
      ff.on('log', collect)
      await ff.exec(['-hide_banner', '-encoders'])
      ff.off('log', collect)
      const interesting = encoders.filter((l) =>
        /\b(libmp3lame|aac|libopus|libvorbis|flac|libx264|libx265|libvpx|mjpeg|png)\b/.test(l),
      )
      log(`检测到关键编码器:\n${interesting.join('\n') || '(未匹配)'}`)

      const wav = makeSineWav()
      log(`生成测试 WAV: ${wav.byteLength} 字节`)
      const t0 = performance.now()
      const mp3 = await runFFmpeg({
        inputs: [{ name: 'in.wav', data: wav }],
        args: ['-i', 'in.wav', '-b:a', '64k', 'out.mp3'],
        output: 'out.mp3',
        onLog: (line) => console.debug('[ffmpeg]', line),
        onProgress: (p) => setLoadRatio(p),
      })
      const ms = Math.round(performance.now() - t0)
      if (mp3.byteLength < 500) throw new Error(`MP3 输出异常小: ${mp3.byteLength} 字节`)
      log(`WAV → MP3 转换成功: ${mp3.byteLength} 字节，耗时 ${ms} ms`, 'ok')
      log('[FFMPEG_OK]', 'ok')
    } catch (e) {
      log(`[FFMPEG_FAIL] ${e instanceof Error ? e.message : String(e)}`, 'err')
      console.error(e)
    } finally {
      setBusy(null)
      setLoadRatio(null)
    }
  }

  const testLibreOffice = async () => {
    setBusy('libreoffice')
    try {
      log('开始加载 LibreOffice 引擎（首次约 78 MB，之后走缓存）...')
      const onProgress = (ratio: number, label: string) => {
        setLoadRatio(ratio)
        if (ratio >= 1) log(`引擎资产下载完成: ${label}`)
      }
      const res = await runLibreOffice(
        {
          input: new Uint8Array(await (await fetch('/fixtures/sample.docx')).arrayBuffer()),
          filename: 'sample.docx',
          options: { outputFormat: 'pdf' },
        },
        onProgress,
      )
      const bytes = res.data instanceof Uint8Array ? res.data : new Uint8Array(res.data as ArrayBuffer)
      const head = new TextDecoder().decode(bytes.slice(0, 5))
      if (head !== '%PDF-') throw new Error(`输出不是 PDF（开头: ${head}）`)
      log(`LibreOffice 引擎转换成功: ${bytes.byteLength} 字节 PDF`, 'ok')
      log('[LO_OK]', 'ok')
    } catch (e) {
      log(`[LO_FAIL] ${e instanceof Error ? e.message : String(e)}`, 'err')
      console.error(e)
    } finally {
      setBusy(null)
      setLoadRatio(null)
    }
  }

  return (
    <section className="spike">
      <h2>M0 引擎验证面板</h2>
      <p className="hint">
        crossOriginIsolated: <strong>{String(window.crossOriginIsolated)}</strong>
        （必须为 true，SharedArrayBuffer 才可用）
      </p>
      <div className="spike-actions">
        <button onClick={testFFmpeg} disabled={busy !== null}>
          {busy === 'ffmpeg' ? '运行中…' : '测试 ffmpeg（WAV → MP3）'}
        </button>
        <button onClick={testLibreOffice} disabled={busy !== null}>
          {busy === 'libreoffice' ? '运行中…' : '测试 LibreOffice（DOCX → PDF）'}
        </button>
      </div>
      {loadRatio !== null && (
        <div className="progress-row">
          <div className="progress">
            <div className="progress-bar" style={{ width: `${Math.round(loadRatio * 100)}%` }} />
          </div>
          <span className="progress-pct">{Math.round(loadRatio * 100)}%</span>
        </div>
      )}
      <div className="log" ref={logRef}>
        {lines.length === 0 ? '等待执行…' : null}
        {lines.map((l, i) => (
          <div key={i} className={`log-line log-${l.level}`}>
            {l.text}
          </div>
        ))}
      </div>
    </section>
  )
}
