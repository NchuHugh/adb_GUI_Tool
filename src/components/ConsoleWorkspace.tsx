import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createLogStore, useLogStore } from '../store/logStore'
import { MAX_LOG_FILE_BYTES, parseLogArchive } from '../utils/logArchive'
import { clampLogFontSize, DEFAULT_LOG_FONT_SIZE, parseLogFontSize } from '../utils/logFontSize'
import LogPanel from './LogPanel'
import { LogPanelStore } from './LogPanelStore'
import LogResizeHandle from './log/LogResizeHandle'

function isFileDrag(event: DragEvent) {
  return event.dataTransfer?.types.includes('Files')
}

export default function ConsoleWorkspace() {
  const logPanelHeight = useLogStore(s => s.logPanelHeight)
  const resizeLogPanel = useLogStore(s => s.resizeLogPanel)
  const [popup, setPopup] = useState<Window | null>(null)
  const popupRef = useRef<Window | null>(null)
  const [archive, setArchive] = useState<{ id: number; name: string; store: ReturnType<typeof createLogStore> }>()
  const [view, setView] = useState<'live' | 'archive'>('live')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const importSequence = useRef(0)
  const [fontSize, setFontSize] = useState(() =>
    parseLogFontSize(localStorage.getItem('logFontSize') ?? '', DEFAULT_LOG_FONT_SIZE))
  const changeFontSize = (size: number) => setFontSize(clampLogFontSize(size))

  useEffect(() => {
    localStorage.setItem('logFontSize', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    if (!popup) return
    const handleZoom = (event: WheelEvent) => {
      if (!event.ctrlKey || !event.deltaY) return
      event.preventDefault()
      const step = event.deltaY < 0 ? 1 : -1
      setFontSize(size => clampLogFontSize(size + step))
    }
    popup.addEventListener('wheel', handleZoom, { passive: false })
    return () => {
      if (!popup.closed) popup.removeEventListener('wheel', handleZoom)
    }
  }, [popup])

  function openConsole() {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus()
      return true
    }
    const child = window.open('about:blank', 'adb-gui-console', 'popup')
    if (!child) {
      setMessage('无法打开独立控制台')
      return false
    }
    const doc = child.document
    doc.title = 'ADB GUI · 控制台'
    doc.documentElement.lang = document.documentElement.lang
    doc.documentElement.dataset.theme = document.documentElement.dataset.theme
    for (const sheet of document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')) {
      const copy = sheet.cloneNode(true) as HTMLLinkElement | HTMLStyleElement
      if (sheet instanceof HTMLLinkElement) (copy as HTMLLinkElement).href = sheet.href
      doc.head.append(copy)
    }
    doc.body.className = 'bg-app-bg text-text-primary'
    popupRef.current = child
    setPopup(child)
    child.focus()
    return true
  }

  useEffect(() => {
    if (!popup) return
    const close = () => {
      if (popupRef.current !== popup) return
      popupRef.current = null
      setPopup(null)
    }
    const themeObserver = new MutationObserver(() => {
      if (!popup.closed) popup.document.documentElement.dataset.theme = document.documentElement.dataset.theme
    })
    themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] })
    // Native title-bar close can happen before a renderer unload event is dispatched.
    const timer = window.setInterval(() => {
      if (popup.closed) close()
    }, 150)
    popup.addEventListener('pagehide', close)
    return () => {
      themeObserver.disconnect()
      window.clearInterval(timer)
      if (!popup.closed) popup.removeEventListener('pagehide', close)
    }
  }, [popup])

  useEffect(() => () => popupRef.current?.close(), [])

  async function importLog(load: () => Promise<{ name: string; text: string } | null>) {
    const alreadyOpen = !!popupRef.current && !popupRef.current.closed
    // Open synchronously in the click or drop event, before waiting for a file.
    if (!openConsole()) return
    const target = popupRef.current
    const sequence = ++importSequence.current
    setLoading(true)
    setMessage('')
    try {
      const file = await load()
      if (sequence !== importSequence.current || target?.closed) return
      if (!file) {
        if (!alreadyOpen) target?.close()
        return
      }
      const data = parseLogArchive(file.text)
      const store = createLogStore(false)
      store.setState({ ...data, autoScroll: false })
      setArchive({ id: sequence, name: file.name, store })
      setView('archive')
    } catch (error) {
      if (sequence === importSequence.current) {
        setMessage(error instanceof Error ? error.message : '无法打开日志文件')
      }
    } finally {
      if (sequence === importSequence.current) setLoading(false)
    }
  }

  useEffect(() => {
    const allowDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const drop = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files ?? [])
      const file = files.find(item => /\.log$/i.test(item.name)) ?? files[0]
      if (file) void importLog(async () => {
        if (!/\.log$/i.test(file.name)) throw new Error('请选择 ADB GUI 导出的 .log 文件')
        if (file.size > MAX_LOG_FILE_BYTES) throw new Error('日志文件超过 128 MB，无法打开')
        return { name: file.name, text: await file.text() }
      })
    }
    const windows = popup ? [window, popup] : [window]
    for (const target of windows) {
      target.addEventListener('dragover', allowDrop)
      target.addEventListener('drop', drop)
    }
    return () => {
      for (const target of windows) {
        if (target.closed) continue
        target.removeEventListener('dragover', allowDrop)
        target.removeEventListener('drop', drop)
      }
    }
  }, [popup])

  const showPicker = () => {
    if (loading) return
    void importLog(async () => {
      const file = await window.electronAPI.openLogFile()
      if (file && 'error' in file) throw new Error(file.error)
      return file
    })
  }
  const archiveView = view === 'archive' ? archive : undefined

  return (
    <>
      {popup && !popup.closed ? (
        <>
          <div className="flex items-center gap-2 border-t border-divider bg-sidebar-bg px-3 py-1.5 text-xs">
            <button className="btn-ghost rounded px-2 py-1" onClick={openConsole}>显示控制台</button>
            <button className="btn-ghost rounded px-2 py-1" onClick={() => popup.close()}>收回控制台</button>
          </div>
          {createPortal(
            <main className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="flex h-11 flex-shrink-0 items-center gap-1 border-b border-divider bg-sidebar-bg px-3">
                <button type="button" aria-pressed={!archiveView} onClick={() => setView('live')}
                  className={`rounded-md px-3 py-1.5 text-xs ${!archiveView ? 'bg-primary/15 text-primary' : 'btn-ghost'}`}>
                  实时控制台
                </button>
                {archive && (
                  <button type="button" aria-pressed={!!archiveView} onClick={() => setView('archive')}
                    title={archive.name} className={`max-w-[50%] truncate rounded-md px-3 py-1.5 text-xs ${archiveView ? 'bg-primary/15 text-primary' : 'btn-ghost'}`}>
                    {archive.name}
                  </button>
                )}
                <span role="status" className="ml-auto truncate text-xs text-text-secondary">
                  {loading ? '正在打开日志…' : message || '可拖入 .log 日志文件'}
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <LogPanelStore.Provider value={archiveView?.store ?? useLogStore}>
                  <LogPanel key={archiveView?.id ?? 'live'} archive={!!archiveView} onOpenFile={showPicker} fontSize={fontSize} onFontSizeChange={changeFontSize} />
                </LogPanelStore.Provider>
              </div>
            </main>,
            popup.document.body,
          )}
        </>
      ) : (
        <>
          {message && <p role="status" className="bg-sidebar-bg px-3 py-1 text-xs text-text-secondary">{message}</p>}
          <LogResizeHandle onResize={resizeLogPanel} />
          <div style={{ height: logPanelHeight, flexShrink: 0 }} className="min-h-0">
            <LogPanel onDetach={() => { setView('live'); openConsole() }} onOpenFile={showPicker} fontSize={fontSize} onFontSizeChange={changeFontSize} />
          </div>
        </>
      )}
    </>
  )
}
