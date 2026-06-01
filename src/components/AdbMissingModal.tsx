import { useState } from 'react'
import { useDeviceStore } from '../store/deviceStore'
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, X } from 'lucide-react'

export default function AdbMissingModal() {
  const adbError = useDeviceStore(s => s.adbError)
  const [showDetails, setShowDetails] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // 仅在 adb 不可用且未被关闭时显示
  const isAdbAvailable = useDeviceStore(s => s.isAdbAvailable)
  if (isAdbAvailable || dismissed) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="bg-slate-800 border border-divider rounded-lg shadow-2xl max-w-lg w-[90vw]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider">
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} className="text-amber-500" />
            <h2 className="text-lg font-semibold text-text-primary">未检测到 adb</h2>
          </div>
          <button
            className="btn-ghost p-1 rounded-md"
            onClick={() => setDismissed(true)}
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-text-secondary">
            无法在系统 PATH 中找到 adb 可执行文件。请按照以下步骤修复：
          </p>

          <ol className="text-sm text-text-secondary space-y-3 list-decimal list-inside">
            <li className="pl-1">
              下载 Android SDK Platform Tools
              <br />
              <a
                className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
                href="https://developer.android.com/studio/releases/platform-tools"
                onClick={e => {
                  e.preventDefault()
                  window.electronAPI.openExternal('https://developer.android.com/studio/releases/platform-tools')
                }}
              >
                https://developer.android.com/studio/releases/platform-tools
                <ExternalLink size={12} />
              </a>
            </li>
            <li className="pl-1">
              将解压后的 <code className="bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">platform-tools</code> 目录添加到系统 PATH 环境变量
            </li>
            <li className="pl-1">重启本工具</li>
          </ol>

          {/* 错误详情（可折叠）*/}
          {adbError && (
            <div>
              <button
                className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                错误详情
              </button>
              {showDetails && (
                <pre className="mt-2 p-3 bg-slate-900 rounded-md text-xs font-mono text-red-400 overflow-x-auto max-h-32">
                  {adbError}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-divider flex justify-center">
          <button
            className="btn-secondary px-6"
            onClick={() => setDismissed(true)}
          >
            关闭提示，继续使用
          </button>
        </div>
      </div>
    </div>
  )
}
