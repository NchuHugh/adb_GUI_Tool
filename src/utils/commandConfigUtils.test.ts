import { describe, expect, it } from 'vitest'
import { buildLogExportText, deleteCustomGroup } from './commandConfigUtils'
import { CommandsConfig } from '../types'

describe('deleteCustomGroup', () => {
  it('deletes the custom group and only its custom commands', () => {
    const config: CommandsConfig = {
      version: '1',
      groups: [
        { id: 'builtin', label: '内置', icon: 'Folder', order: 0 },
        { id: 'custom', label: '自定义', icon: 'Folder', order: 1, custom: true },
      ],
      commands: [
        { id: 'builtin-cmd', groupId: 'custom', label: '内置命令', description: '', template: 'adb shell true', params: [], outputMode: 'once', timeout: 1000 },
        { id: 'custom-cmd', groupId: 'custom', label: '自定义命令', description: '', template: 'adb shell true', params: [], outputMode: 'once', timeout: 1000, custom: true },
      ],
    }
    const result = deleteCustomGroup(config, 'custom')
    expect(result.groups.map(group => group.id)).toEqual(['builtin'])
    expect(result.commands.map(command => command.id)).toEqual(['builtin-cmd'])
  })
})

describe('buildLogExportText', () => {
  it('uses raw lines and the displayed segment order, ignoring filters and collapse', () => {
    const result = buildLogExportText(
      ['one', 'two'], 'desc',
      new Map([
        ['one', { lineIds: ['a'] }],
        ['two', { lineIds: ['b', 'system'] }],
      ]),
      new Map([
        ['a', { raw: '\u001b[31mfirst\u001b[0m', stream: 'stdout' }],
        ['b', { raw: 'second', stream: 'stderr' }],
        ['system', { raw: 'ignored', stream: 'system' }],
      ]),
    )
    expect(result).toBe('second\n\n----------------------------------------\n\n\u001b[31mfirst\u001b[0m')
  })
})
