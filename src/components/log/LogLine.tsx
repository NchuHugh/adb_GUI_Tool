import { memo } from 'react'
import { LogLine as LogLineType } from '../../types'
import { ansiToHtml, escapeHtml, getLineClassName, stripAnsi } from '../../utils/logUtils'

interface Props {
  line: LogLineType
  regex: RegExp | null
  isMatched: boolean
  isActiveMatch: boolean
}

function renderMatch(raw: string, regex: RegExp): string {
  const text = stripAnsi(raw)
  let html = ''
  let end = 0
  regex.lastIndex = 0
  for (const match of text.matchAll(regex)) {
    if (!match[0]) continue
    const start = match.index ?? 0
    html += escapeHtml(text.slice(end, start))
    html += '<mark class="bg-yellow-300/50 text-inherit">' + escapeHtml(match[0]) + '</mark>'
    end = start + match[0].length
  }
  return html + escapeHtml(text.slice(end))
}

export default memo(function LogLine({ line, regex, isMatched, isActiveMatch }: Props) {
  const html = isMatched && regex ? renderMatch(line.raw, regex) : ansiToHtml(line.raw)
  return (
    <div
      className={`h-full px-3 overflow-hidden whitespace-pre font-mono ${getLineClassName(line)} ${isActiveMatch ? 'bg-orange-500/20' : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
