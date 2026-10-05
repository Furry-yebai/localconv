import { useState, type ReactNode } from 'react'
import { CheckCircle, CircleNotch, Clock, Download, Warning, X, XCircle } from '@phosphor-icons/react'
import { uniqueFilename } from '../dispatch/converters'
import { zipBlobs } from '../lib/zip'
import { useTasks, type Task } from '../state/tasks'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function statusIcon(task: Task): ReactNode {
  switch (task.status) {
    case 'queued':
      return <Clock size={18} aria-hidden />
    case 'running':
      return (
        <span className="spin">
          <CircleNotch size={18} aria-hidden />
        </span>
      )
    case 'done':
      return <CheckCircle size={18} weight="fill" aria-hidden />
    case 'error':
      return <XCircle size={18} weight="fill" aria-hidden />
  }
}

export default function TaskList() {
  const { tasks, removeTask, clearFinished } = useTasks()
  const [zipping, setZipping] = useState(false)

  if (tasks.length === 0) return null

  const hasFinished = tasks.some((t) => t.status === 'done' || t.status === 'error')
  const doneTasks = tasks.filter((t) => t.status === 'done' && t.result)

  const downloadAll = async () => {
    setZipping(true)
    try {
      const taken = new Set<string>()
      const files = doneTasks.map((t) => ({
        name: uniqueFilename(t.result!.filename, taken),
        blob: t.result!.blob,
      }))
      const zipped = await zipBlobs(files)
      download(new Blob([zipped as BlobPart], { type: 'application/zip' }), 'localconv-converted.zip')
    } catch (e) {
      console.error('[zip]', e)
      alert(`打包失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setZipping(false)
    }
  }

  return (
    <section className="tasklist">
      <div className="tasklist-header">
        <h3>转换任务（{tasks.length}）</h3>
        <div className="tasklist-actions">
          {doneTasks.length >= 2 && (
            <button className="btn-primary" onClick={downloadAll} disabled={zipping}>
              {zipping ? '打包中…' : `全部下载（zip，${doneTasks.length}）`}
            </button>
          )}
          {hasFinished && (
            <button className="ghost" onClick={clearFinished}>
              清空已完成
            </button>
          )}
        </div>
      </div>
      {tasks.map((task) => (
        <div key={task.id} className={`task-card task-${task.status}`}>
          <div className="task-icon">{statusIcon(task)}</div>
          <div className="task-main">
            <div className="task-name" title={task.filename}>
              {task.filename}
            </div>
            <div className="task-meta">
              {formatBytes(task.size)}
              {task.status === 'running' && <span className="task-label"> · {task.label}</span>}
              {task.status === 'error' && <span className="task-error-msg"> · {task.error}</span>}
              {task.status === 'done' && task.result?.warnings?.map((w, i) => (
                <span key={i} className="task-warning-msg">
                  <Warning size={13} aria-hidden />
                  {w}
                </span>
              ))}
            </div>
            {task.status === 'running' && (
              <div className="progress-row task-progress">
                <div className="progress">
                  <div
                    className={`progress-bar${task.progress < 0 ? ' indeterminate' : ''}`}
                    style={task.progress >= 0 ? { width: `${Math.round(task.progress * 100)}%` } : undefined}
                  />
                </div>
                {task.progress >= 0 && <span className="progress-pct">{Math.round(task.progress * 100)}%</span>}
              </div>
            )}
          </div>
          <div className="task-actions">
            {task.status === 'done' && task.result && (
              <button className="btn-primary" onClick={() => download(task.result!.blob, task.result!.filename)}>
                <Download size={15} aria-hidden />
                下载
              </button>
            )}
            <button
              className="ghost icon-ghost"
              onClick={() => removeTask(task.id)}
              aria-label="移除"
              title="移除"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}
