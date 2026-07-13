import { forwardRef } from 'react'
import { useLogStore } from '../store/logStore'
import LogContent, { LogContentHandle } from './log/LogContent'
import LogSearchBar from './log/LogSearchBar'
import LogToolbar from './log/LogToolbar'

interface Props {
  isFloating?: boolean
}

const LogPanel = forwardRef<LogContentHandle, Props>(function LogPanel({ isFloating = false }: Props, ref) {
  const searchQuery = useLogStore(s => s.searchQuery)
  const searchOptions = useLogStore(s => s.searchOptions)
  const searchError = useLogStore(s => s.searchError)
  const matchedLineIds = useLogStore(s => s.matchedLineIds)
  const activeMatchIndex = useLogStore(s => s.activeMatchIndex)
  const setSearchQuery = useLogStore(s => s.setSearchQuery)
  const setSearchOptions = useLogStore(s => s.setSearchOptions)
  const navigateMatch = useLogStore(s => s.navigateMatch)

  return (
    <div className="flex flex-col border-t border-divider h-full min-h-0">
      <LogToolbar isFloating={isFloating} />
      <LogSearchBar
        query={searchQuery}
        options={searchOptions}
        error={searchError}
        matchedCount={matchedLineIds.length}
        activeMatchIndex={activeMatchIndex}
        onQueryChange={setSearchQuery}
        onOptionsChange={setSearchOptions}
        onNavigate={navigateMatch}
      />
      <LogContent ref={ref} />
    </div>
  )
})

export default LogPanel
