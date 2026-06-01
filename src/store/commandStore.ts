import { create } from 'zustand'
import { CommandDef, CommandGroup, CommandsConfig, ExecutionState, CommandParam } from '../types'

interface ParamDialogState {
  isOpen: boolean
  command: CommandDef | null
  initialValues: Record<string, string>
  mode: 'execute' | 'favorite'   // F3: 区分执行模式和收藏模式
}

interface FillPickerState {
  isOpen: boolean
  targetParamKey: string | null
  sourceCommandId: string | null
  sourceCommandLabel: string | null
  outputLines: string[]
  isLoading: boolean
  filterText: string
  onSelect: ((value: string) => void) | null
}

interface CommandStore {
  // 命令配置
  config: CommandsConfig | null
  groups: CommandGroup[]
  commands: CommandDef[]

  // 选中的分组（null 表示"全部命令"）
  selectedGroupId: string | null

  // 搜索关键词
  searchQuery: string

  // 命令执行状态
  executionStates: Map<string, ExecutionState>

  // F3: 参数弹窗状态
  paramDialog: ParamDialogState

  // F4: 一键填入状态
  fillPicker: FillPickerState

  // F2: 待执行命令元信息（用于构造 HistoryEntry，替代 contextBridge 拦截）
  pendingCommandMetas: Map<string, { commandId: string; resolvedArgs: string[]; commandLabel: string }>

  // Bug 4 fix: cmdId → commandLabel 缓存（供 LogPanel 展示完成信息）
  commandLabels: Map<string, string>

  // 新增：命令编辑器弹窗状态
  commandEditorOpen: boolean
  editingCommand: CommandDef | null   // F1: null = 新建模式；有值 = 编辑模式
  prefilledTemplate: CommandDef | null // F2: ParamDialog 预填模板

  // 操作
  setConfig: (config: CommandsConfig) => void
  selectGroup: (groupId: string | null) => void
  setSearchQuery: (query: string) => void
  updateExecutionState: (cmdId: string, state: Partial<ExecutionState>) => void
  getFilteredCommands: () => CommandDef[]
  openParamDialog: (command: CommandDef, initialValues?: Record<string, string>) => void
  openParamDialogForFavorite: (command: CommandDef) => void
  closeParamDialog: () => void
  openFillPicker: (targetParamKey: string, param: CommandParam, onSelect: (value: string) => void) => void
  closeFillPicker: (selectedValue?: string) => void
  setFillPickerOutput: (lines: string[], label: string) => void
  setFillPickerLoading: (loading: boolean) => void
  setFillPickerFilter: (text: string) => void
  recordPendingMeta: (cmdId: string, commandId: string, resolvedArgs: string[], commandLabel: string) => void
  consumePendingMeta: (cmdId: string) => { commandId: string; resolvedArgs: string[]; commandLabel: string } | undefined
  openCommandEditor: (command?: CommandDef) => void
  closeCommandEditor: () => void
  openCommandEditorFromParam: (sourceCommand: CommandDef, paramValues: Record<string, string>) => void
}

export const useCommandStore = create<CommandStore>((set, get) => ({
  config: null,
  groups: [],
  commands: [],
  selectedGroupId: null,
  searchQuery: '',
  executionStates: new Map(),
  paramDialog: { isOpen: false, command: null, initialValues: {}, mode: 'execute' },
  fillPicker: {
    isOpen: false,
    targetParamKey: null,
    sourceCommandId: null,
    sourceCommandLabel: null,
    outputLines: [],
    isLoading: false,
    filterText: '',
    onSelect: null,
  },
  pendingCommandMetas: new Map(),
  commandLabels: new Map(),
  commandEditorOpen: false,
  editingCommand: null,
  prefilledTemplate: null,

  setConfig: (config) => {
    const validCommands = config.commands.filter(c => !c.invalid)
    set({
      config,
      groups: config.groups.sort((a, b) => a.order - b.order),
      commands: validCommands,
    })
  },

  selectGroup: (groupId) => set({ selectedGroupId: groupId }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  updateExecutionState: (cmdId, state) => {
    const current = get().executionStates
    const updated = new Map(current)
    const existing = updated.get(cmdId) || {
      cmdId,
      commandId: '',
      status: 'idle' as const,
      startTime: 0,
    }
    updated.set(cmdId, { ...existing, ...state } as ExecutionState)
    set({ executionStates: updated })
  },

  getFilteredCommands: () => {
    const { commands, selectedGroupId, searchQuery } = get()
    let filtered = commands

    if (selectedGroupId) {
      filtered = filtered.filter(c => c.groupId === selectedGroupId)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        c =>
          c.label.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags?.some(t => t.toLowerCase().includes(q))
      )
    }

    return filtered
  },

  openParamDialog: (command, initialValues = {}) =>
    set({ paramDialog: { isOpen: true, command, initialValues, mode: 'execute' } }),

  openParamDialogForFavorite: (command) =>
    set({ paramDialog: { isOpen: true, command, initialValues: {}, mode: 'favorite' } }),

  closeParamDialog: () =>
    set({ paramDialog: { isOpen: false, command: null, initialValues: {}, mode: 'execute' } }),

  openFillPicker: (targetParamKey, param, onSelect) =>
    set({
      fillPicker: {
        isOpen: true,
        targetParamKey,
        sourceCommandId: param.fillSourceCommandId || null,
        sourceCommandLabel: null,
        outputLines: [],
        isLoading: false,
        filterText: '',
        onSelect,
      },
    }),

  closeFillPicker: (selectedValue) => {
    const state = get().fillPicker
    if (selectedValue && state.onSelect) {
      state.onSelect(selectedValue)
    }
    set({
      fillPicker: {
        isOpen: false,
        targetParamKey: null,
        sourceCommandId: null,
        sourceCommandLabel: null,
        outputLines: [],
        isLoading: false,
        filterText: '',
        onSelect: null,
      },
    })
  },

  setFillPickerOutput: (lines, label) =>
    set(s => ({
      fillPicker: { ...s.fillPicker, outputLines: lines, sourceCommandLabel: label, isLoading: false },
    })),

  setFillPickerLoading: (loading) =>
    set(s => ({ fillPicker: { ...s.fillPicker, isLoading: loading } })),

  setFillPickerFilter: (text) =>
    set(s => ({ fillPicker: { ...s.fillPicker, filterText: text } })),

  recordPendingMeta: (cmdId, commandId, resolvedArgs, commandLabel) => {
    const metas = new Map(get().pendingCommandMetas)
    metas.set(cmdId, { commandId, resolvedArgs, commandLabel })
    // Bug 4 fix: 同时缓存标签供 LogPanel 使用
    const labels = new Map(get().commandLabels)
    labels.set(cmdId, commandLabel)
    set({ pendingCommandMetas: metas, commandLabels: labels })
  },

  consumePendingMeta: (cmdId) => {
    const meta = get().pendingCommandMetas.get(cmdId)
    if (meta) {
      const metas = new Map(get().pendingCommandMetas)
      metas.delete(cmdId)
      set({ pendingCommandMetas: metas })
    }
    return meta
  },

  openCommandEditor: (command) => set({
    commandEditorOpen: true,
    // 防御：仅当参数为有效 CommandDef（含 id 字段）时才作为编辑对象，否则置 null
    editingCommand: (command && typeof command === 'object' && 'id' in command) ? command : null,
  }),
  closeCommandEditor: () => set({
    commandEditorOpen: false,
    editingCommand: null,
    prefilledTemplate: null,
  }),

  openCommandEditorFromParam: (sourceCommand, paramValues) => {
    const prefilled: CommandDef = {
      ...sourceCommand,
      id: '',
      label: `${sourceCommand.label}（副本）`,
      custom: true,
      params: sourceCommand.params.map(p => ({
        ...p,
        default: paramValues[p.key] ?? p.default ?? '',
      })),
    }
    set({
      commandEditorOpen: true,
      editingCommand: null,
      prefilledTemplate: prefilled,
    })
  },
}))
