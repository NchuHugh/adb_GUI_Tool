import { useContext, useId, useMemo, useRef, useState } from 'react'
import { getLogcatFields, stripAnsi } from '../../utils/logUtils'
import { LogPanelStore } from '../LogPanelStore'

const FILTER_KEYS = ['tag:', 'pid:']
const MAX_SUGGESTIONS = 5
const RECENT_LINES = 2500

export default function LogFieldFilter() {
  const store = useContext(LogPanelStore)
  const value = store(state => state.fieldFilter)
  const setValue = store(state => state.setFieldFilter)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [caret, setCaret] = useState(0)
  const [selected, setSelected] = useState(-1)
  const start = caret - (value.slice(0, caret).match(/\S*$/)?.[0].length ?? 0)
  const end = caret + (value.slice(caret).match(/^\S*/)?.[0].length ?? 0)
  const token = value.slice(start, caret).toLowerCase()

  const suggestions = useMemo(() => {
    if (!open) return []
    const key = FILTER_KEYS.find(field => token.startsWith(field))
    if (!key) return FILTER_KEYS.filter(field => field.startsWith(token))
    const { lines, lineOrder } = store.getState()
    const matches = new Set<string>()
    const partial = token.slice(key.length)
    const first = Math.max(0, lineOrder.length - RECENT_LINES)
    for (let index = lineOrder.length - 1; index >= first && matches.size < MAX_SUGGESTIONS; index--) {
      const line = lines.get(lineOrder[index])
      if (!line) continue
      const { pid, tag } = getLogcatFields(stripAnsi(line.raw))
      const term = key === 'pid:' ? pid : tag.split(/\s/, 1)[0]
      if (term && term.toLowerCase().includes(partial)) matches.add(key + term)
    }
    return [...matches]
  }, [open, store, token])

  const accept = (completion: string) => {
    const suffix = value.slice(end)
    const separator = completion.endsWith(':') || /^\s/.test(suffix) ? '' : ' '
    const prefix = value.slice(0, start) + completion + separator
    const nextCaret = prefix.length + (separator === '' && !completion.endsWith(':') && suffix ? 1 : 0)
    setValue(prefix + suffix)
    setCaret(nextCaret)
    setSelected(-1)
    setOpen(completion.endsWith(':'))
    const input = inputRef.current
    input?.ownerDocument.defaultView?.requestAnimationFrame(() => input.setSelectionRange(nextCaret, nextCaret))
  }

  return (
    <div className="relative w-[clamp(14rem,34%,26rem)] shrink-0">
      <input
        ref={inputRef}
        className="w-full rounded border border-divider bg-slate-800 px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-primary"
        role="combobox"
        aria-label="筛选日志"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={open && suggestions.length > 0 ? listId : undefined}
        aria-activedescendant={open && suggestions[selected] ? `${listId}-${selected}` : undefined}
        aria-describedby={open ? `${listId}-help` : undefined}
        placeholder="筛选：tag:Activity pid:123"
        value={value}
        onFocus={event => {
          setCaret(event.currentTarget.selectionStart ?? value.length)
          setSelected(-1)
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onSelect={event => setCaret(event.currentTarget.selectionStart ?? value.length)}
        onChange={event => {
          setValue(event.currentTarget.value)
          setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length)
          setSelected(-1)
          setOpen(true)
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            setOpen(false)
          }
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
            event.preventDefault()
            const direction = event.key === 'ArrowDown' ? 1 : -1
            setSelected(index => index < 0
              ? (direction > 0 ? 0 : suggestions.length - 1)
              : (index + direction + suggestions.length) % suggestions.length)
          }
          if (event.key === 'Enter' && suggestions.length) {
            event.preventDefault()
            accept(suggestions[selected] ?? suggestions[0])
          }
        }}
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-divider bg-slate-900 p-1 shadow-lg">
          {suggestions.length > 0 && (
            <ul id={listId} role="listbox" aria-label="筛选补全">
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === selected}
                  className={`cursor-pointer truncate rounded px-2 py-0.5 font-mono text-xs ${index === selected ? 'bg-primary/15 text-primary' : 'text-text-primary hover:bg-card-hover'}`}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => accept(suggestion)}
                >
                  {suggestion}
                  {FILTER_KEYS.includes(suggestion) && (
                    <span className="ml-2 font-sans text-text-secondary">
                      {suggestion === 'tag:' ? '按日志标签筛选' : '按进程 ID 筛选'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p id={`${listId}-help`} className="px-2 py-1 text-xs text-text-secondary">
            支持普通文本，多个条件用空格分隔。
          </p>
        </div>
      )}
    </div>
  )
}
