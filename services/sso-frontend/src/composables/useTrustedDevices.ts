import { computed, reactive, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { profileApi } from '@/services/profile.api'
import type { TrustedDeviceSummary } from '@/types/profile.types'

interface TrustedDevicesState {
  devices: Ref<readonly TrustedDeviceSummary[]>
  pending: Ref<boolean>
  mutatingId: Ref<number | null>
  error: Ref<string | null>
  labels: Record<number, string>
  hasDevices: ComputedRef<boolean>
  load: () => Promise<void>
  rename: (deviceId: number) => Promise<void>
  revoke: (deviceId: number) => Promise<void>
  updateLabel: (deviceId: number, value: string) => void
}

export function useTrustedDevices(): TrustedDevicesState {
  const devices = ref<readonly TrustedDeviceSummary[]>([])
  const pending = ref(false)
  const mutatingId = ref<number | null>(null)
  const error = ref<string | null>(null)
  const labels = reactive<Record<number, string>>({})

  const hasDevices = computed<boolean>(() => devices.value.length > 0)

  async function load(): Promise<void> {
    pending.value = true
    error.value = null
    try {
      devices.value = await profileApi.getTrustedDevices()
      syncLabels(devices.value)
    } catch {
      error.value = 'Daftar perangkat tepercaya belum bisa dimuat.'
    } finally {
      pending.value = false
    }
  }

  async function rename(deviceId: number): Promise<void> {
    const label = (labels[deviceId] ?? '').trim()
    if (!label) return
    mutatingId.value = deviceId
    error.value = null
    try {
      const response = await profileApi.renameTrustedDevice(deviceId, { label })
      devices.value = devices.value.map((device) =>
        device.id === deviceId ? { ...device, label: response.device.label } : device,
      )
    } catch {
      error.value = 'Nama perangkat belum bisa disimpan.'
    } finally {
      mutatingId.value = null
    }
  }

  async function revoke(deviceId: number): Promise<void> {
    mutatingId.value = deviceId
    error.value = null
    try {
      await profileApi.revokeTrustedDevice(deviceId)
      devices.value = devices.value.filter((device) => device.id !== deviceId)
      delete labels[deviceId]
    } catch {
      error.value = 'Perangkat belum bisa dicabut.'
    } finally {
      mutatingId.value = null
    }
  }

  function updateLabel(deviceId: number, value: string): void {
    labels[deviceId] = value
  }

  function syncLabels(nextDevices: readonly TrustedDeviceSummary[]): void {
    nextDevices.forEach((device) => {
      labels[device.id] = device.label ?? ''
    })
  }

  return { devices, pending, mutatingId, error, labels, hasDevices, load, rename, revoke, updateLabel }
}
