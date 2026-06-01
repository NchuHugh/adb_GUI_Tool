import { CommandParam } from '../types'
import { ChevronDown } from 'lucide-react'

interface ParamFieldProps {
  param: CommandParam
  value: string
  error?: string
  onChange: (key: string, value: string) => void
  onFillRequest?: (key: string) => void
}

export default function ParamField({ param, value, error, onChange, onFillRequest }: ParamFieldProps) {
  const inputClass = `w-full bg-slate-700 rounded px-3 py-2 text-sm font-mono
    border ${error ? 'border-red-500' : 'border-slate-600'}
    focus:outline-none focus:border-blue-500 text-text-primary placeholder:text-slate-500`

  const renderInput = () => {
    switch (param.type) {
      case 'select':
        return (
          <select
            value={value}
            onChange={e => onChange(param.key, e.target.value)}
            className={`${inputClass} appearance-none`}
          >
            <option value="">-- 请选择 --</option>
            {param.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )

      case 'file':
        return (
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              placeholder={param.placeholder}
              onChange={e => onChange(param.key, e.target.value)}
              className={`${inputClass} flex-1`}
              readOnly
            />
            <button
              type="button"
              onClick={async () => {
                const path = await window.electronAPI.selectFile()
                if (path) onChange(param.key, path)
              }}
              className="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded text-sm text-text-primary whitespace-nowrap transition-colors"
            >
              浏览
            </button>
          </div>
        )

      case 'directory':
        return (
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              placeholder={param.placeholder}
              onChange={e => onChange(param.key, e.target.value)}
              className={`${inputClass} flex-1`}
              readOnly
            />
            <button
              type="button"
              onClick={async () => {
                const path = await window.electronAPI.selectDirectory()
                if (path) onChange(param.key, path)
              }}
              className="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded text-sm text-text-primary whitespace-nowrap transition-colors"
            >
              浏览
            </button>
          </div>
        )

      case 'text':
      default:
        return (
          <input
            type="text"
            value={value}
            placeholder={param.placeholder}
            onChange={e => onChange(param.key, e.target.value)}
            className={inputClass}
          />
        )
    }
  }

  return (
    <div className="space-y-1.5">
      {/* 字段标签 */}
      <label className="flex items-center gap-1 text-sm text-text-secondary">
        {param.label}
        {param.required && <span className="text-red-400">*</span>}
      </label>

      {/* 输入区（含一键填入按钮） */}
      {param.fillable && onFillRequest ? (
        <div className="flex gap-2">
          <div className="flex-1">{renderInput()}</div>
          <button
            type="button"
            onClick={() => onFillRequest(param.key)}
            className="flex items-center gap-1 px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded text-sm text-text-primary whitespace-nowrap transition-colors"
            title="从其他命令输出中选择值填入"
          >
            一键填入 <ChevronDown size={14} />
          </button>
        </div>
      ) : (
        renderInput()
      )}

      {/* 错误提示 */}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
