import { useEffect, useState } from 'react'
import { Moon, ShieldCheck, Sun } from '@phosphor-icons/react'
import DropZone from './components/DropZone'
import TaskList from './components/TaskList'
import AudioPanel, { type AudioOptions } from './features/audio/AudioPanel'
import DocPanel from './features/docs/DocPanel'
import type { DocOutput } from './features/docs/convert'
import type { VideoOptions } from './features/video/convert'
import VideoPanel from './features/video/VideoPanel'
import SpikePage from './spike/SpikePage'
import { TasksProvider, useTasks, type ModuleKind, type OptionValue } from './state/tasks'
import './index.css'

type View = ModuleKind | 'spike' | 'about'

const MODULE_META: Record<ModuleKind, { label: string; accept: string; hint: string; ready: boolean }> = {
  audio: {
    label: '音频',
    accept: 'audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.wma',
    hint: '支持 MP3 / WAV / FLAC / M4A / OGG / OPUS 等格式互转与压缩',
    ready: true,
  },
  video: {
    label: '视频',
    accept: 'video/*,.mp4,.mkv,.webm,.mov,.avi,.flv,.wmv,.ts',
    hint: '改封装（秒级完成）、提取音轨、重编码压缩',
    ready: true,
  },
  doc: {
    label: '文档',
    accept: '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.html,.epub,.pdf',
    hint: 'Word / Excel / PPT / ODT 等 → PDF，以及常用格式互转',
    ready: true,
  },
}

function ConvertView({
  moduleTab,
  setModuleTab,
  audioOptions,
  setAudioOptions,
  videoOptions,
  setVideoOptions,
  docOutput,
  setDocOutput,
}: {
  moduleTab: ModuleKind
  setModuleTab: (m: ModuleKind) => void
  audioOptions: AudioOptions
  setAudioOptions: (o: AudioOptions) => void
  videoOptions: VideoOptions
  setVideoOptions: (o: VideoOptions) => void
  docOutput: DocOutput
  setDocOutput: (o: DocOutput) => void
}) {
  const { addFiles } = useTasks()
  const meta = MODULE_META[moduleTab]

  const currentOptions = (): Record<string, OptionValue> => {
    switch (moduleTab) {
      case 'audio':
        return { ...audioOptions }
      case 'video':
        return { ...videoOptions }
      case 'doc':
        return { output: docOutput }
    }
  }

  return (
    <>
      <nav className="tabs" role="tablist">
        {(Object.keys(MODULE_META) as ModuleKind[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={moduleTab === key}
            className={`tab${moduleTab === key ? ' active' : ''}`}
            onClick={() => setModuleTab(key)}
          >
            {MODULE_META[key].label}
            {!MODULE_META[key].ready && <span className="badge-dev">研发中</span>}
          </button>
        ))}
      </nav>

      <div className="module-body">
        {moduleTab === 'audio' && <AudioPanel value={audioOptions} onChange={setAudioOptions} />}
        {moduleTab === 'video' && <VideoPanel value={videoOptions} onChange={setVideoOptions} />}
        {moduleTab === 'doc' && <DocPanel value={docOutput} onChange={setDocOutput} />}

        {meta.ready ? (
          <DropZone accept={meta.accept} hint={meta.hint} onFiles={(files) => addFiles(files, moduleTab, currentOptions())} />
        ) : (
          <div className="coming-soon">
            {meta.label}转换正在开发中——引擎已完成验证（ffmpeg.wasm / LibreOffice WASM），即将上线。
          </div>
        )}

        <TaskList />
      </div>
    </>
  )
}

function AboutView() {
  return (
    <section className="about">
      <h2>隐私说明</h2>
      <p>
        本站所有转换均在<strong>你的浏览器内</strong>完成（基于 WebAssembly 技术）。
        文件不会被上传到任何服务器，也不会离开你的设备——关闭标签页后一切随之消失。
      </p>
      <p>
        网站本身是一个纯静态站点（Cloudflare Pages 托管），没有后端服务，也没有任何统计、
        广告或第三方追踪脚本。
      </p>

      <h2>技术实现</h2>
      <ul>
        <li>音频 / 视频：FFmpeg 编译为 WebAssembly（ffmpeg.wasm），在 Web Worker 中运行</li>
        <li>文档：LibreOffice 编译为 WebAssembly，Office ↔ PDF 本地转换</li>
        <li>首次使用会下载引擎文件（约 10–80 MB），之后由浏览器缓存，二次访问不再下载</li>
      </ul>
    </section>
  )
}

function Shell() {
  const [view, setView] = useState<View>('audio')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('localconv-theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [audioOptions, setAudioOptions] = useState<AudioOptions>({ format: 'mp3', bitrate: '192k' })
  const [videoOptions, setVideoOptions] = useState<VideoOptions>({
    mode: 'smart',
    container: 'mp4',
    extractFormat: 'mp3',
    resolution: 'source',
    quality: 'balanced',
  })
  const [docOutput, setDocOutput] = useState<DocOutput>('pdf')
  const isModule = view === 'audio' || view === 'video' || view === 'doc'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('localconv-theme', theme)
  }, [theme])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <h1 className="brand" onClick={() => setView('audio')}>
            <ShieldCheck className="brand-mark" size={28} weight="fill" aria-hidden />
            <span className="brand-name">LocalConv</span>
            <span className="muted">本地文件转换</span>
          </h1>
          <nav className="header-links">
            <button className={view === 'about' ? 'active' : ''} onClick={() => setView('about')}>
              隐私 · 许可
            </button>
            <button className={view === 'spike' ? 'active' : ''} onClick={() => setView('spike')}>
              诊断
            </button>
            <button
              className="icon-btn"
              aria-label="切换主题"
              title="切换主题"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              <span className="theme-icon" key={theme}>
                {theme === 'light' ? <Moon size={17} aria-hidden /> : <Sun size={17} aria-hidden />}
              </span>
            </button>
          </nav>
        </div>
        <p className="tagline">全部转换在你的浏览器内完成，文件不会上传到任何服务器。</p>
        {!window.crossOriginIsolated && (
          <div className="warning">
            当前页面未启用跨源隔离（SharedArrayBuffer 不可用），文档转换引擎将无法运行。请检查响应头
            COOP/COEP 配置。
          </div>
        )}
      </header>

      <main key={view}>
        {isModule && (
          <ConvertView
            moduleTab={view}
            setModuleTab={setView}
            audioOptions={audioOptions}
            setAudioOptions={setAudioOptions}
            videoOptions={videoOptions}
            setVideoOptions={setVideoOptions}
            docOutput={docOutput}
            setDocOutput={setDocOutput}
          />
        )}
        {view === 'spike' && <SpikePage />}
        {view === 'about' && <AboutView />}
      </main>

      <footer className="app-footer">
        <div className="footer-projects">
          <span>基于开源项目：</span>
          <a href="https://github.com/ffmpegwasm/ffmpeg.wasm" target="_blank" rel="noreferrer">
            ffmpeg.wasm（GPL-2.0+）
          </a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/matbeedotcom/libreoffice-document-converter" target="_blank" rel="noreferrer">
            LibreOffice WASM（MPL-2.0）
          </a>
        </div>
        <div className="footer-copy">© 2026 LocalConv 版权所有</div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <TasksProvider>
      <Shell />
    </TasksProvider>
  )
}
