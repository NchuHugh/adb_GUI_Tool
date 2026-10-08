import { CommandGroup, CommandsConfig } from '../types'

export function deleteCustomGroup(config: CommandsConfig, groupId: string): CommandsConfig {
  const group = config.groups.find(item => item.id === groupId)
  if (!group) throw new Error(`分组 "${groupId}" 不存在`)
  if (!group.custom) throw new Error(`内置分组 "${group.label}" 不能删除`)

  return {
    ...config,
    groups: config.groups.filter(item => item.id !== groupId),
    commands: config.commands.filter(command => command.groupId !== groupId || !command.custom),
  }
}

export function createCustomGroup(input: Pick<CommandGroup, 'id' | 'label' | 'icon'>, groups: CommandGroup[]): CommandGroup {
  if (!input.id.trim()) throw new Error('分组 ID 不能为空')
  if (groups.some(group => group.id === input.id)) throw new Error(`分组 ID "${input.id}" 已存在`)
  return {
    id: input.id.trim(),
    label: input.label.trim(),
    icon: input.icon || 'Folder',
    order: groups.length ? Math.max(...groups.map(group => group.order)) + 1 : 0,
    custom: true,
  }
}

export function buildLogExportText(
  segmentOrder: string[],
  segmentOrderDisplay: 'asc' | 'desc',
  segments: Map<string, { lineIds: string[]; commandLabel?: string; resolvedCommand?: string }>,
  lines: Map<string, { raw: string; stream: string }>,
): string {
  const ordered = segmentOrderDisplay === 'desc' ? [...segmentOrder].reverse() : segmentOrder
  return ordered.map(id => {
    const segment = segments.get(id)
    if (!segment) return ''
    const output = segment.lineIds
      .map(lineId => lines.get(lineId))
      .filter((line): line is { raw: string; stream: string } => !!line && line.stream !== 'system')
      .map(line => line.raw)
      .join('\n')
    const command = segment.resolvedCommand?.trim() || segment.commandLabel?.trim() || id
    return [`命令: ${command}`, output].filter(Boolean).join('\n')
  }).join('\n\n----------------------------------------\n\n')
}
