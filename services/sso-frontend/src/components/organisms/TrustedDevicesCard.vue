<script setup lang="ts">
import { computed } from 'vue'
import { Monitor, Smartphone, Tablet, Trash2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatSessionTimestamp, relativeSessionTime, sessionDeviceLabel } from '@/lib/session-presentation'
import { parseUserAgent } from '@/lib/parse-user-agent'
import type { TrustedDeviceSummary } from '@/types/profile.types'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
interface Props {
  devices: readonly TrustedDeviceSummary[]
  labels: Readonly<Record<number, string>>
  pending: boolean
  mutatingId: number | null
  error: string | null
}

interface Emits {
  (e: 'update:label', deviceId: number, value: string): void
  (e: 'rename', deviceId: number): void
  (e: 'revoke', deviceId: number): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const hasDevices = computed<boolean>(() => props.devices.length > 0)

function deviceTitle(device: TrustedDeviceSummary): string {
  return device.label || sessionDeviceLabel(parseUserAgent(device.user_agent), device.user_agent)
}

function deviceKind(device: TrustedDeviceSummary): string {
  return parseUserAgent(device.user_agent).device
}

function handleLabelInput(deviceId: number, value: string | number): void {
  emit('update:label', deviceId, String(value))
}

function handleRename(deviceId: number): void {
  emit('rename', deviceId)
}

function handleRevoke(deviceId: number): void {
  emit('revoke', deviceId)
}
</script>

<template>
  <Card data-testid="trusted-devices-card">
    <CardHeader>
      <CardTitle class="text-base font-semibold">{{ t('portal.devices.title') }}</CardTitle>
      <CardDescription>{{ t('portal.devices.description') }}</CardDescription>
    </CardHeader>

    <CardContent class="grid gap-4">
      <p v-if="props.error" class="text-destructive text-sm" role="alert">
        {{ props.error }}
      </p>

      <div v-if="props.pending" class="grid gap-3">
        <Skeleton v-for="i in 2" :key="i" class="h-32 rounded-xl" />
      </div>

      <p v-else-if="!hasDevices" class="text-muted-foreground text-sm">
        {{ t('portal.devices.empty') }}
      </p>

      <div v-else class="grid gap-3">
        <section
          v-for="device in props.devices"
          :key="device.id"
          data-testid="trusted-device-item"
          class="grid min-w-0 gap-4 rounded-lg border p-4 md:grid-cols-[2.75rem_minmax(0,1fr)_auto]"
        >
          <span class="sso-glass-pill grid size-10 place-items-center text-white" aria-hidden="true">
            <Smartphone v-if="deviceKind(device) === 'mobile'" class="size-5" />
            <Tablet v-else-if="deviceKind(device) === 'tablet'" class="size-5" />
            <Monitor v-else class="size-5" />
          </span>

          <div class="grid min-w-0 gap-3">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <strong class="truncate text-sm">{{ deviceTitle(device) }}</strong>
              <Badge variant="secondary" class="font-mono text-[10px]">
                {{ device.fingerprint }}
              </Badge>
            </div>

            <div class="grid gap-2 text-xs sm:grid-cols-3">
              <span class="grid gap-0.5">
                <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">IP</span>
                <span class="font-mono tabular-nums">{{
                  device.ip_address ?? t('portal.devices.unknown_ip')
                }}</span>
              </span>
              <span class="grid gap-0.5">
                <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">{{
                  t('portal.devices.trusted')
                }}</span>
                <time :datetime="device.trusted_at ?? undefined">{{ formatSessionTimestamp(device.trusted_at) }}</time>
              </span>
              <span class="grid gap-0.5">
                <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">{{
                  t('portal.devices.last_active')
                }}</span>
                <time :datetime="device.last_seen_at ?? undefined">
                  {{
                    device.last_seen_at
                      ? relativeSessionTime(device.last_seen_at)
                      : t('portal.devices.no_activity')
                  }}
                </time>
              </span>
            </div>

            <label class="grid gap-1 text-xs">
              <span class="text-muted-foreground font-medium">{{
                t('portal.devices.device_name')
              }}</span>
              <Input
                :model-value="props.labels[device.id] ?? ''"
                maxlength="80"
                :disabled="props.mutatingId === device.id"
                :aria-label="t('portal.devices.device_name_aria', { name: deviceTitle(device) })"
                @update:model-value="handleLabelInput(device.id, $event)"
              />
            </label>
          </div>

          <div class="flex flex-col gap-2 md:items-end">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              :disabled="props.mutatingId === device.id"
              @click="handleRename(device.id)"
            >
              {{ t('portal.devices.save_name') }}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              :disabled="props.mutatingId === device.id"
              @click="handleRevoke(device.id)"
            >
              <Trash2 class="size-4" aria-hidden="true" />
              {{ t('portal.devices.revoke') }}
            </Button>
          </div>
        </section>
      </div>
    </CardContent>
  </Card>
</template>
