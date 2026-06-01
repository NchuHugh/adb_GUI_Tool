import { create } from 'zustand'
import { DeviceInfo } from '../types'

interface DeviceStore {
  devices: DeviceInfo[]
  selectedSerial: string | null
  isAdbAvailable: boolean
  adbVersion: string | null
  adbError: string | null

  setDevices: (devices: DeviceInfo[]) => void
  selectDevice: (serial: string | null) => void
  setAdbAvailability: (available: boolean, version?: string, error?: string) => void
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  selectedSerial: null,
  isAdbAvailable: true, // 默认 true，检测失败再设为 false
  adbVersion: null,
  adbError: null,

  setDevices: (devices) => {
    // 单设备自动选中
    let selectedSerial = useDeviceStore.getState().selectedSerial
    if (devices.length === 1 && devices[0].state === 'device') {
      selectedSerial = devices[0].serial
    } else if (devices.length === 0) {
      selectedSerial = null
    }
    set({ devices, selectedSerial })
  },

  selectDevice: (serial) => {
    set({ selectedSerial: serial })
    // F4: 同步到主进程（供 runSilent 使用）
    window.electronAPI.setSelectedDevice?.(serial)
  },

  setAdbAvailability: (available, version, error) =>
    set({ isAdbAvailable: available, adbVersion: version ?? null, adbError: error ?? null }),
}))
