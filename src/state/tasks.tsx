import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { runConversion } from '../dispatch/converters'

export type ModuleKind = 'audio' | 'video' | 'doc'
export type OptionValue = string | number | boolean

export interface TaskResult {
  blob: Blob
  filename: string
  warnings?: string[]
}

export interface Task {
  id: string
  kind: ModuleKind
  file: File
  filename: string
  size: number
  options: Record<string, OptionValue>
  status: 'queued' | 'running' | 'done' | 'error'
  /** 0..1, or -1 for indeterminate */
  progress: number
  label: string
  result?: TaskResult
  error?: string
}

interface TasksContextValue {
  tasks: Task[]
  addFiles: (files: File[], kind: ModuleKind, options: Record<string, OptionValue>) => void
  removeTask: (id: string) => void
  clearFinished: () => void
}

const TasksContext = createContext<TasksContextValue | null>(null)

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const idRef = useRef(0)

  const update = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const runTask = useCallback(
    async (task: Task) => {
      update(task.id, { status: 'running', progress: -1, label: '准备中…' })
      try {
        const result = await runConversion(task.kind, {
          file: task.file,
          options: task.options,
          onProgress: (ratio, label) =>
            update(task.id, {
              progress: ratio,
              label: label ?? (ratio >= 1 ? '完成' : '转换中…'),
            }),
        })
        update(task.id, {
          status: 'done',
          progress: 1,
          label: '完成',
          result: { blob: result.blob, filename: result.filename, warnings: result.warnings },
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error(`[task ${task.filename}]`, e)
        update(task.id, { status: 'error', progress: -1, label: '失败', error: message })
      }
    },
    [update],
  )

  const addFiles = useCallback(
    (files: File[], kind: ModuleKind, options: Record<string, OptionValue>) => {
      if (files.length === 0) return
      const newTasks: Task[] = files.map((file) => ({
        id: `task-${++idRef.current}`,
        kind,
        file,
        filename: file.name,
        size: file.size,
        options,
        status: 'queued',
        progress: -1,
        label: '排队中',
      }))
      setTasks((prev) => [...newTasks, ...prev])
      for (const task of newTasks) {
        queueRef.current = queueRef.current.then(() => runTask(task))
      }
    },
    [runTask],
  )

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const clearFinished = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== 'done' && t.status !== 'error'))
  }, [])

  const value = useMemo(
    () => ({ tasks, addFiles, removeTask, clearFinished }),
    [tasks, addFiles, removeTask, clearFinished],
  )

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasks must be used within TasksProvider')
  return ctx
}
