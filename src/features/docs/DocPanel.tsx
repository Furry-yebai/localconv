import { DOC_OUTPUTS, type DocOutput } from './convert'

interface Props {
  value: DocOutput
  onChange: (next: DocOutput) => void
}

export default function DocPanel({ value, onChange }: Props) {
  return (
    <>
      <div className="settings">
        <label className="setting">
          <span>输出格式</span>
          <select value={value} onChange={(e) => onChange(e.target.value as DocOutput)}>
            {DOC_OUTPUTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mode-hint">
        Word / Excel / PPT / ODF / PDF / 纯文本在浏览器内互转。具体可用的目标格式取决于输入文档类型，
        不兼容的组合会明确提示。首次使用会下载 LibreOffice 引擎（约 78 MB，之后走缓存）。
      </div>
    </>
  )
}
