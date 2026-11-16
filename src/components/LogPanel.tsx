import { usePanelLogStore } from './LogPanelStore'
import LogContent from './log/LogContent'
import LogSearchBar from './log/LogSearchBar'
import LogToolbar from './log/LogToolbar'

interface Props {
  onDetach?: () => void
  onOpenFile?: () => void
  archive?: boolean
  fontSize: number
  onFontSizeChange: (size: number) => void
}

export default function LogPanel({ onDetach, onOpenFile, archive, fontSize, onFontSizeChange }: Props) {
  const searchQuery = usePanelLogStore(s => s.searchQuery)
  const searchOptions = usePanelLogStore(s => s.searchOptions)
  const searchError = usePanelLogStore(s => s.searchError)
  const matchedCount = usePanelLogStore(s => s.matchedLineIds.length)
  const activeMatchIndex = usePanelLogStore(s => s.activeMatchIndex)
  const setSearchQuery = usePanelLogStore(s => s.setSearchQuery)
  const setSearchOptions = usePanelLogStore(s => s.setSearchOptions)
  const navigateMatch = usePanelLogStore(s => s.navigateMatch)

  return (
    <div className="flex flex-col border-t border-divider h-full min-h-0">
      <LogToolbar onDetach={onDetach} onOpenFile={onOpenFile} archive={archive} fontSize={fontSize} onFontSizeChange={onFontSizeChange} />
      <LogSearchBar
        query={searchQuery}
        options={searchOptions}
        error={searchError}
        matchedCount={matchedCount}
        activeMatchIndex={activeMatchIndex}
        onQueryChange={setSearchQuery}
        onOptionsChange={setSearchOptions}
        onNavigate={navigateMatch}
      />
      <LogContent fontSize={fontSize} archive={archive} />
    </div>
  )
}
