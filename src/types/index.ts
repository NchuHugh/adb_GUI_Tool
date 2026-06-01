// ============================================================
// ADB GUI — 共享类型定义
// 所有 IPC 通道数据类型、命令配置类型、设备信息类型
// ============================================================

// ---- IPC 通道 payload 类型 ----

/** 渲染进程 → 主进程：执行一条命令 */
export interface RunRequest {
  cmdId: string          // 本次执行唯一 ID（UUID）
  commandId: string      // commands.json 中的命令 ID
  resolvedArgs: string[] // 已替换占位符的参数列表
}

/** 主进程 → 渲染进程：实时命令输出块 */
export interface OutputChunk {
  cmdId: string
  stream: 'stdout' | 'stderr'
  text: string
}

/** 主进程 → 渲染进程：命令执行结束 */
export interface DoneEvent {
  cmdId: string
  exitCode: number
  durationMs: number
  reason: 'normal' | 'timeout' | 'killed' | 'adb_unavailable'
}

/** 主进程 → 渲染进程：adb 可用性检测结果 */
export interface AdbAvailabilityEvent {
  available: boolean
  version?: string
  error?: string
}

/** 设备信息（从 adb devices -l 解析） */
export interface DeviceInfo {
  serial: string
  state: 'device' | 'offline' | 'unauthorized'
  model?: string
}

// ---- 命令配置类型（与 commands.json 对应） ----

export type ParamType = 'text' | 'file' | 'directory' | 'select'
export type OutputMode = 'stream' | 'once'

export interface CommandParam {
  key: string
  label: string
  type: ParamType
  required: boolean
  default: string
  placeholder?: string
  fillable?: boolean
  options?: string[]
  fillSourceCommandId?: string
}

export interface CommandDef {
  id: string
  groupId: string
  label: string
  description: string
  template: string
  params: CommandParam[]
  outputMode: OutputMode
  timeout: number
  tags?: string[]
  /** 校验失败时标记为 invalid */
  invalid?: boolean
  invalidReason?: string
  /** 用户自定义添加的命令 */
  custom?: boolean
}

export interface CommandGroup {
  id: string
  label: string
  icon: string
  order: number
}

export interface CommandsConfig {
  version: string
  groups: CommandGroup[]
  commands: CommandDef[]
}

// ---- 命令执行状态 ----

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'failed' | 'timeout'

export interface ExecutionState {
  cmdId: string
  commandId: string
  status: ExecutionStatus
  startTime: number
  exitCode?: number
  durationMs?: number
}

// ---- 历史记录 ----

export interface HistoryEntry {
  id: string                     // UUID
  commandId: string              // commands.json 中的命令 ID
  commandLabel: string           // 命令显示名称（冗余存储）
  resolvedCommand: string        // 最终执行的完整命令字符串
  resolvedArgs: string[]         // 参数数组（用于重新执行时预填）
  exitCode: number               // 执行结果退出码
  durationMs: number             // 执行耗时
  executedAt: string             // ISO 8601 时间字符串
  hasParams: boolean             // 是否含参数
  outputText: string             // 命令输出文本（用于 FillPicker 缓存）
}

// ---- 收藏条目（F3） ----

export interface FavoriteEntry {
  id: string                       // UUID
  commandId: string                // 对应的命令 ID（引用）
  commandLabel: string             // 冗余存储命令标签
  nickname: string                 // 用户为此收藏起的别名
  resolvedArgs: Record<string, string>  // 参数值快照
  hasParams: boolean               // 是否含参数
  pinnedAt: string                 // ISO 8601 收藏时间
  order: number                    // 排序字段
}

// ---- IPC 通道名称常量 ----

export const IPC_CHANNELS = {
  COMMANDS_LIST: 'commands:list',
  ADB_RUN: 'adb:run',
  ADB_OUTPUT: 'adb:output',
  ADB_DONE: 'adb:done',
  ADB_KILL: 'adb:kill',
  DEVICE_STATUS: 'device:status',
  ADB_AVAILABILITY: 'adb:availability',
  COMMANDS_SAVE: 'commands:save',
  COMMANDS_DELETE: 'commands:delete',
  COMMANDS_UPDATE: 'commands:update',
  FAVORITES_LOAD: 'favorites:load',
  FAVORITES_SAVE: 'favorites:save',
} as const

// ---- contextBridge 暴露的 API 类型 ----

export interface ElectronAPI {
  getCommands: () => Promise<CommandsConfig>
  runCommand: (request: RunRequest) => Promise<void>
  killCommand: (cmdId: string) => void
  onAdbOutput: (callback: (chunk: OutputChunk) => void) => () => void
  onAdbDone: (callback: (event: DoneEvent) => void) => () => void
  onDeviceStatus: (callback: (devices: DeviceInfo[]) => void) => () => void
  onAdbAvailability: (callback: (result: AdbAvailabilityEvent) => void) => () => void
  selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
  selectDirectory: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
  loadHistory: () => Promise<HistoryEntry[]>
  saveHistory: (entries: HistoryEntry[]) => Promise<void>
  runCommandSilent: (commandId: string) => Promise<{ success: boolean; output: string; exitCode: number }>
  setSelectedDevice: (serial: string | null) => Promise<void>
  copyToClipboard: (text: string) => Promise<void>
  saveCommands: (config: CommandsConfig) => Promise<void>
  addCommand: (command: CommandDef) => Promise<{ success: boolean; error?: string; config?: CommandsConfig }>
  deleteCommand: (id: string) => Promise<{ success: boolean; error?: string; config?: CommandsConfig }>
  updateCommand: (command: CommandDef) => Promise<{ success: boolean; error?: string; config?: CommandsConfig }>
  loadFavorites: () => Promise<FavoriteEntry[]>
  saveFavorites: (entries: FavoriteEntry[]) => Promise<void>
}

// 扩展 Window 接口
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
