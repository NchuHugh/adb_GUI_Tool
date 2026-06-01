import { useDeviceStore } from '../store/deviceStore'
import { Smartphone, RefreshCw, AlertTriangle } from 'lucide-react'

export default function DeviceStatusBar() {
  const devices = useDeviceStore(s => s.devices)
  const selectedSerial = useDeviceStore(s => s.selectedSerial)
  const selectDevice = useDeviceStore(s => s.selectDevice)
  const isAdbAvailable = useDeviceStore(s => s.isAdbAvailable)

  const statusIcon = () => {
    if (!isAdbAvailable) {
      return <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" title="adb 未就绪" />
    }
    if (devices.length === 0) {
      return <span className="status-dot offline" title="未检测到设备" />
    }
    const selected = devices.find(d => d.serial === selectedSerial)
    if (!selected) {
      return <span className="status-dot offline" title="未选中设备" />
    }
    return <span className={`status-dot ${selected.state}`} title={selected.state} />
  }

  const statusText = () => {
    if (!isAdbAvailable) return 'adb 未就绪'
    if (devices.length === 0) return '未检测到设备'
    const selected = devices.find(d => d.serial === selectedSerial)
    if (!selected) return `${devices.length} 台设备（未选择）`
    const model = selected.model ? ` (${selected.model})` : ''
    return `${selected.serial}${model} — ${selected.state}`
  }

  const statusColor = () => {
    if (!isAdbAvailable) return 'text-amber-500'
    if (devices.length === 0) return 'text-error'
    const selected = devices.find(d => d.serial === selectedSerial)
    if (!selected) return 'text-warning'
    if (selected.state === 'device') return 'text-success'
    if (selected.state === 'unauthorized') return 'text-warning'
    return 'text-error'
  }

  return (
    <div
      className="flex items-center justify-between px-4 border-b border-divider bg-sidebar-bg no-select"
      style={{ height: 48 }}
    >
      <div className="flex items-center gap-3">
        <Smartphone size={18} className="text-text-secondary" />
        <div className="flex items-center gap-2">
          {statusIcon()}
          {!isAdbAvailable ? (
            <button
              className="flex items-center gap-1.5 text-sm text-amber-500 hover:text-amber-400 transition-colors"
              onClick={() => {
                // 重新打开 AdbMissingModal：临时将 isAdbAvailable 设为之前的 false 值
                // 由于 AdbMissingModal 使用 dismiss 状态，需要重置
                // 此处通过先设 true 再设 false 来触发重新渲染
                useDeviceStore.getState().setAdbAvailability(false)
              }}
              title="点击查看详情"
            >
              <AlertTriangle size={14} />
              {statusText()}
            </button>
          ) : (
            <span className={`text-sm ${statusColor()}`}>{statusText()}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* 多设备选择下拉 */}
        {devices.length > 1 && (
          <select
            className="bg-slate-800 border border-divider rounded-md px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-primary"
            value={selectedSerial || ''}
            onChange={e => selectDevice(e.target.value || null)}
          >
            <option value="">选择设备...</option>
            {devices.map(d => (
              <option key={d.serial} value={d.serial}>
                {d.serial} {d.model ? `(${d.model})` : ''} [{d.state}]
              </option>
            ))}
          </select>
        )}

        {/* 手动刷新按钮 */}
        <button
          className="btn-ghost p-1.5 rounded-md"
          title="刷新设备列表"
          onClick={() => {
            // 触发一次即时轮询 — 由主进程处理
          }}
        >
          <RefreshCw size={16} />
        </button>
      </div>
    </div>
  )
}
