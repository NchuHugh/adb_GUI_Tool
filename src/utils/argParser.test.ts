import { describe, expect, it } from 'vitest'
import { extractTemplatePlaceholders, formatCommand, getAdbDeviceArgs, getCommandTool, templateToCommandArgs } from './argParser'

describe('Platform Tools command templates', () => {
  it('passes the entire shell script as one argument', () => {
    const script = 'cd /data/local/tmp && printf "%s" "a b" | cat > result'
    const template = 'adb shell "cd /data/local/tmp && printf \\"%s\\" \\"a b\\" | cat > result"'
    const args = templateToCommandArgs(template)
    expect(args).toEqual(['shell', script])
  })

  it('preserves raw scripts, shell variables and escaped glob characters', () => {
    const script = 'cd /data/local/tmp && printf "%s" "${HOME}" | cat'
    expect(templateToCommandArgs('adb shell {cmd}', { cmd: script })).toEqual(['shell', script])
    expect(templateToCommandArgs('adb shell ' + script)).toEqual(['shell', script])
    expect(templateToCommandArgs('adb shell {cmd}', { cmd: 'adb shell "cd /data/local/tmp && pwd"' }))
      .toEqual(['shell', 'cd /data/local/tmp && pwd'])
    expect(templateToCommandArgs('adb shell "printf \\*"')).toEqual(['shell', 'printf \\*'])
    expect([...extractTemplatePlaceholders('adb shell echo "${HOME}" {name}')]).toEqual(['name'])
  })

  it('quotes remote parameters and preserves local Windows paths and replacement characters', () => {
    expect(templateToCommandArgs('adb shell ls {path}', { path: "/sdcard/it's a test" }))
      .toEqual(['shell', "ls '/sdcard/it'\\''s a test'"])
    expect(templateToCommandArgs('adb shell printf "%s" "path={path}"', { path: '$HOME "a"' }))
      .toEqual(['shell', 'printf "%s" "path=\\$HOME \\"a\\""'])
    const path = 'C:\\Program Files\\$&\\test.apk'
    const args = templateToCommandArgs('adb install "{path}"', { path })
    expect(args).toEqual(['install', path])
    expect(templateToCommandArgs(formatCommand('adb', args))).toEqual(args)
  })

  it('separates Fastboot and honors explicit ADB target selection', () => {
    expect(getCommandTool('fastboot.exe -s ABC getvar product')).toBe('fastboot')
    expect(templateToCommandArgs('fastboot -s {serial} getvar product', { serial: 'ABC' }))
      .toEqual(['-s', 'ABC', 'getvar', 'product'])
    expect(getAdbDeviceArgs(['devices', '-l'], 'ABC')).toEqual(['devices', '-l'])
    expect(getAdbDeviceArgs(['-H', 'localhost', '-s', 'XYZ', 'shell', 'pwd'], 'ABC'))
      .toEqual(['-H', 'localhost', '-s', 'XYZ', 'shell', 'pwd'])
    expect(getAdbDeviceArgs(['shell', 'pwd'], 'ABC')).toEqual(['-s', 'ABC', 'shell', 'pwd'])
  })
})
