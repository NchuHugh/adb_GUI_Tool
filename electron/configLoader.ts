// ============================================================
// ConfigLoader — 读取、解析、校验 commands.json 配置文件
// 校验失败不阻止启动，标记为 invalid 供 UI 展示警告
// ============================================================

import fs from 'fs'
import path from 'path'
import { CommandsConfig, CommandDef, CommandGroup } from '../src/types'

const CONFIG_FILENAME = 'commands.json'

export class ConfigLoader {
  private config: CommandsConfig | null = null
  private configPath: string
  private builtinPath: string
  private builtinCommandIds: Set<string> | null = null

  constructor() {
    // 优先读取用户数据目录（允许用户自定义覆盖）
    // 若不存在则回退到应用内置的 config/
    const userDataPath = path.join(
      process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming'),
      'adb-gui',
      CONFIG_FILENAME
    )

    this.builtinPath = path.join(__dirname, '../config', CONFIG_FILENAME)

    if (fs.existsSync(userDataPath)) {
      this.configPath = userDataPath
    } else {
      this.configPath = this.builtinPath
    }
  }

  /** 获取内置命令 ID 集合（用于区分内置 vs 自定义） */
  private getBuiltinCommandIds(): Set<string> {
    if (this.builtinCommandIds) return this.builtinCommandIds
    try {
      const raw = fs.readFileSync(this.builtinPath, 'utf-8')
      const builtin = JSON.parse(raw) as CommandsConfig
      this.builtinCommandIds = new Set(builtin.commands.map(c => c.id))
    } catch {
      this.builtinCommandIds = new Set()
    }
    return this.builtinCommandIds
  }

  /** 读取并解析配置文件 */
  load(): CommandsConfig {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8')
      const parsed = JSON.parse(raw) as CommandsConfig
      this.config = parsed
      return parsed
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        throw new Error(`commands.json JSON 解析失败: ${err.message}`)
      }
      throw new Error(`无法读取配置文件 ${this.configPath}: ${err.message}`)
    }
  }

  /** 校验配置文件的语义正确性，标记无效命令 */
  validate(): CommandsConfig {
    if (!this.config) {
      this.load()
    }
    const config = this.config!

    const groupIds = new Set(config.groups.map(g => g.id))
    const commandIds = new Set<string>()
    const errors: string[] = []

    for (const cmd of config.commands) {
      // 检查重复 ID
      if (commandIds.has(cmd.id)) {
        cmd.invalid = true
        cmd.invalidReason = `重复的命令 ID: ${cmd.id}`
        errors.push(cmd.invalidReason)
        continue
      }
      commandIds.add(cmd.id)

      // 检查 groupId 是否存在
      if (!groupIds.has(cmd.groupId)) {
        cmd.invalid = true
        cmd.invalidReason = `命令 "${cmd.id}" 引用了不存在的分组: ${cmd.groupId}`
        errors.push(cmd.invalidReason)
        continue
      }

      // 检查 template 中的占位符与 params 的一致性
      const templatePlaceholders = this.extractPlaceholders(cmd.template)
      const paramKeys = new Set(cmd.params.map(p => p.key))

      // template 中的每个占位符必须有对应的 param
      for (const ph of templatePlaceholders) {
        if (!paramKeys.has(ph)) {
          cmd.invalid = true
          cmd.invalidReason = `命令 "${cmd.id}" 的 template 中引用了未定义的参数: {${ph}}`
          errors.push(cmd.invalidReason)
        }
      }

      // 每个 param key 必须在 template 中被引用
      for (const pk of paramKeys) {
        if (!templatePlaceholders.has(pk)) {
          cmd.invalid = true
          cmd.invalidReason = `命令 "${cmd.id}" 定义了参数 "${pk}" 但 template 中未使用`
          errors.push(cmd.invalidReason)
        }
      }
    }

    if (errors.length > 0) {
      console.warn('[ConfigLoader] 配置文件校验警告:', errors)
    }

    // Bug fix: 自动检测非内置命令，标记为 custom: true
    // 解决因 save/load 过程中 custom 字段丢失导致删除按钮不显示的问题
    const builtinIds = this.getBuiltinCommandIds()
    for (const cmd of config.commands) {
      if (!cmd.invalid && cmd.custom === undefined && !builtinIds.has(cmd.id)) {
        cmd.custom = true
      }
    }

    return config
  }

  /** 获取配置（含校验标记） */
  getConfig(): CommandsConfig {
    if (!this.config) {
      this.load()
      this.validate()
    }
    return this.config!
  }

  /** 重新加载配置（热更新用） */
  reload(): CommandsConfig {
    this.config = null
    return this.getConfig()
  }

  /** 保存配置到用户数据目录 */
  saveConfig(): void {
    if (!this.config) return
    const userDataPath = path.join(
      process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming'),
      'adb-gui',
      CONFIG_FILENAME
    )
    const dir = path.dirname(userDataPath)
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(userDataPath, JSON.stringify(this.config, null, 2), 'utf-8')
      this.configPath = userDataPath
      console.log(`[ConfigLoader] 配置已保存到: ${userDataPath}`)
    } catch (err: any) {
      console.error('[ConfigLoader] 保存配置失败:', err.message)
      throw new Error(`保存配置失败: ${err.message}`)
    }
  }

  /** 添加一条新命令到配置中 */
  addCommand(command: CommandDef): CommandsConfig {
    if (!this.config) {
      this.load()
      this.validate()
    }
    const config = this.config!

    // 检查 ID 唯一性
    if (config.commands.some(c => c.id === command.id)) {
      throw new Error(`命令 ID "${command.id}" 已存在`)
    }

    // 检查 groupId 有效性
    if (!config.groups.some(g => g.id === command.groupId)) {
      throw new Error(`分组 "${command.groupId}" 不存在`)
    }

    // 添加命令
    config.commands.push(command)

    // 重新校验新添加的命令
    this.validateSingle(command, config.groups)

    // 持久化保存
    this.saveConfig()

    return config
  }

  /** 校验单条命令 */
  private validateSingle(cmd: CommandDef, groups: CommandGroup[]): void {
    const groupIds = new Set(groups.map(g => g.id))

    if (!groupIds.has(cmd.groupId)) {
      cmd.invalid = true
      cmd.invalidReason = `命令 "${cmd.id}" 引用了不存在的分组: ${cmd.groupId}`
      return
    }

    const templatePlaceholders = this.extractPlaceholders(cmd.template)
    const paramKeys = new Set(cmd.params.map(p => p.key))

    for (const ph of templatePlaceholders) {
      if (!paramKeys.has(ph)) {
        cmd.invalid = true
        cmd.invalidReason = `命令 "${cmd.id}" 的 template 中引用了未定义的参数: {${ph}}`
        return
      }
    }

    for (const pk of paramKeys) {
      if (!templatePlaceholders.has(pk)) {
        cmd.invalid = true
        cmd.invalidReason = `命令 "${cmd.id}" 定义了参数 "${pk}" 但 template 中未使用`
        return
      }
    }
  }

  /** 删除一条用户自定义命令 */
  deleteCommand(id: string): CommandsConfig {
    if (!this.config) {
      this.load()
      this.validate()
    }
    const config = this.config!

    const index = config.commands.findIndex(c => c.id === id)
    if (index === -1) {
      throw new Error(`命令 ID "${id}" 不存在`)
    }

    const cmd = config.commands[index]
    if (!cmd.custom) {
      throw new Error(`命令 "${cmd.label}" 是内置命令，不能删除`)
    }

    // 删除命令
    config.commands.splice(index, 1)

    // 持久化保存
    this.saveConfig()

    console.log(`[ConfigLoader] 已删除自定义命令: ${cmd.label} (${id})`)
    return config
  }

  /** 更新一条用户自定义命令 */
  updateCommand(updated: CommandDef): CommandsConfig {
    if (!this.config) {
      this.load()
      this.validate()
    }
    const config = this.config!

    const index = config.commands.findIndex(c => c.id === updated.id)
    if (index === -1) {
      throw new Error(`命令 ID "${updated.id}" 不存在`)
    }

    if (!config.commands[index].custom) {
      throw new Error(`命令 "${config.commands[index].label}" 是内置命令，不可编辑`)
    }

    // 保留 custom 标记
    config.commands[index] = { ...updated, custom: true }

    // 重新校验
    this.validateSingle(config.commands[index], config.groups)

    // 持久化保存
    this.saveConfig()

    console.log(`[ConfigLoader] 已更新自定义命令: ${updated.label} (${updated.id})`)
    return config
  }

  /** 提取 template 字符串中的 {key} 占位符 */
  private extractPlaceholders(template: string): Set<string> {
    const re = /\{(\w+)\}/g
    const result = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = re.exec(template)) !== null) {
      result.add(match[1])
    }
    return result
  }
}
