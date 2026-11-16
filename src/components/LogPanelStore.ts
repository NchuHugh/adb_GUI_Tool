import { createContext, useContext } from 'react'
import { useLogStore } from '../store/logStore'

export const LogPanelStore = createContext(useLogStore)

export function usePanelLogStore<T>(select: (state: ReturnType<typeof useLogStore.getState>) => T): T {
  const store = useContext(LogPanelStore)
  return store(select)
}
