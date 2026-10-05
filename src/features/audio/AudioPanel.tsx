import { AUDIO_FORMATS, BITRATES, type AudioFormat } from './convert'

export interface AudioOptions {
  format: AudioFormat
  bitrate: string
}

interface Props {
  value: AudioOptions
  onChange: (next: AudioOptions) => void
}

export default function AudioPanel({ value, onChange }: Props) {
  const meta = AUDIO_FORMATS.find((f) => f.id === value.format)!
  const bitrates = BITRATES[value.format]

  return (
    <div className="settings">
      <label className="setting">
        <span>输出格式</span>
        <select
          value={value.format}
          onChange={(e) => {
            const format = e.target.value as AudioFormat
            const list = BITRATES[format]
            const bitrate = list.includes(value.bitrate)
              ? value.bitrate
              : (list[1] ?? list[0] ?? '')
            onChange({ format, bitrate })
          }}
        >
          {AUDIO_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      {meta.lossy && bitrates.length > 0 && (
        <label className="setting">
          <span>比特率</span>
          <select value={value.bitrate} onChange={(e) => onChange({ ...value, bitrate: e.target.value })}>
            {bitrates.map((b) => (
              <option key={b} value={b}>
                {b.replace('k', ' kbps')}
              </option>
            ))}
          </select>
        </label>
      )}

      <span className="setting-hint">
        {meta.lossy
          ? '比特率越低文件越小，音质损失越明显；一般聆听 128–192 kbps 足够。'
          : '无损格式：文件更大，但音质与源文件完全一致。'}
      </span>
    </div>
  )
}
