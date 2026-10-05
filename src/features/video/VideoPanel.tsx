import {
  EXTRACT_FORMATS,
  VIDEO_CONTAINERS,
  type VideoOptions,
} from './convert'

interface Props {
  value: VideoOptions
  onChange: (next: VideoOptions) => void
}

const MODES: { id: VideoOptions['mode']; label: string }[] = [
  { id: 'smart', label: '智能转换（推荐）' },
  { id: 'remux', label: '仅改容器（不重编码）' },
  { id: 'compress', label: '压缩重编码' },
  { id: 'audio', label: '提取音轨' },
]

const MODE_HINT: Record<VideoOptions['mode'], string> = {
  smart: '能不重编码就不重编码：兼容则秒级完成，否则自动转码。',
  remux: '只更换容器封装，画质零损失、速度极快；流不兼容时会报错。',
  compress: '降低分辨率 / 体积，速度约为实时的 0.2–1 倍，长视频请耐心等待。',
  audio: '从视频中抽出音轨并转换为所选音频格式。',
}

export default function VideoPanel({ value, onChange }: Props) {
  const set = (patch: Partial<VideoOptions>) => onChange({ ...value, ...patch })

  return (
    <>
      <div className="settings">
        <label className="setting">
          <span>转换方式</span>
          <select value={value.mode} onChange={(e) => set({ mode: e.target.value as VideoOptions['mode'] })}>
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {value.mode !== 'audio' && (
          <label className="setting">
            <span>输出容器</span>
            <select
              value={value.container}
              onChange={(e) => set({ container: e.target.value as VideoOptions['container'] })}
            >
              {VIDEO_CONTAINERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {value.mode === 'audio' && (
          <label className="setting">
            <span>音频格式</span>
            <select
              value={value.extractFormat}
              onChange={(e) => set({ extractFormat: e.target.value as VideoOptions['extractFormat'] })}
            >
              {EXTRACT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {value.mode === 'compress' && (
          <>
            <label className="setting">
              <span>分辨率</span>
              <select
                value={value.resolution}
                onChange={(e) => set({ resolution: e.target.value as VideoOptions['resolution'] })}
              >
                <option value="source">保持原始</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="480">480p</option>
              </select>
            </label>
            <label className="setting">
              <span>体积目标</span>
              <select
                value={value.quality}
                onChange={(e) => set({ quality: e.target.value as VideoOptions['quality'] })}
              >
                <option value="high">高质量</option>
                <option value="balanced">均衡</option>
                <option value="small">最小体积</option>
              </select>
            </label>
          </>
        )}
      </div>
      <div className="mode-hint">{MODE_HINT[value.mode]}</div>
    </>
  )
}
