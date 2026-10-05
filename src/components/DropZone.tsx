import { useRef, useState, type DragEvent } from 'react'
import { UploadSimple } from '@phosphor-icons/react'

interface Props {
  /** accept attribute for the file input, e.g. "audio/*" or ".docx,.pdf" */
  accept?: string
  hint: string
  onFiles: (files: File[]) => void
}

export default function DropZone({ accept, hint, onFiles }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }

  return (
    <div
      className={`dropzone${dragOver ? ' dragover' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onFiles(files)
          e.target.value = ''
        }}
      />
      <div className="dropzone-icon">
        <UploadSimple size={34} aria-hidden />
      </div>
      <div className="dropzone-text">拖放文件到此处，或点击选择</div>
      <div className="dropzone-hint">{hint}</div>
    </div>
  )
}
