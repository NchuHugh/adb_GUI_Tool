import { LogLine as LogLineType } from '../../types'
import { buildSearchRegex, getLineClassName, injectSearchHighlight } from '../../utils/logUtils'

interface Props {
  line: LogLineType
  searchQuery: string
  caseSensitive: boolean
  useRegex: boolean
  isMatched: boolean
  isActiveMatch: boolean
}

export default function LogLine({
  line,
  searchQuery,
  caseSensitive,
  useRegex,
  isMatched,
  isActiveMatch,
}: Props) {
  const regex = buildSearchRegex(searchQuery, { caseSensitive, useRegex })
  const html = injectSearchHighlight(line.html, line.raw, regex)
  const highlightClass = isActiveMatch
    ? 'bg-orange-500/20'
    : isMatched
      ? 'bg-yellow-400/10'
      : ''

  return (
    <div
      className={`px-3 py-0.5 min-h-5 whitespace-pre-wrap break-words font-mono text-xs leading-5 ${getLineClassName(line)} ${highlightClass}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
