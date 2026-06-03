<script setup lang="ts">
/**
 * SessionCard — molecule: session row with safety-aware actions.
 */

import { computed } from 'vue'
import { AlertTriangle, Info, Monitor, Smartphone, Tablet, Trash2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { parseUserAgent } from '@/lib/parse-user-agent'
import {
  formatSessionTimestamp,
  isDormantSession,
  relativeSessionTime,
  sessionDeviceLabel,
  sessionLocation,
} from '@/lib/session-presentation'
import type { UserSessionSummary } from '@/types/profile.types'

interface Props {
  session: UserSessionSummary
  pending: boolean
  currentIp: string | null
}

interface Emits {
  (e: 'revoke', sessionId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const parsed = computed(() => parseUserAgent(props.session.user_agent))
const deviceLabel = computed<string>(() =>
  props.session.type === 'rp'
    ? appGrantLabel(props.session.client_display_names)
    : sessionDeviceLabel(parsed.value, props.session.user_agent),
)
const locationInfo = computed(() => sessionLocation(props.session, props.currentIp))
const relativeLastUsed = computed<string>(() => relativeSessionTime(props.session.last_used_at))
const isDormant = computed<boolean>(() => isDormantSession(props.session.last_used_at))
const shouldHighlight = computed<boolean>(
  () =>
    props.session.type !== 'rp' &&
    (locationInfo.value.isForeignIp || locationInfo.value.isUnknownIp),
)

function appGrantLabel(displayNames: readonly string[]): string {
  const name = displayNames.find((value) => value.length > 0)
  return name ? `Aplikasi: ${name}` : 'Aplikasi terhubung'
}

function handleRevoke(): void {
  if (props.session.is_current) return
  emit('revoke', props.session.session_id)
}
</script>

<template>
  <Card
    data-testid="session-card"
    :class="
      cn(
        'grid min-w-0 gap-4 overflow-hidden px-4 py-4 transition-all md:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:px-6',
        props.session.is_current && 'border-primary/30 bg-primary/5',
        shouldHighlight &&
          !props.session.is_current &&
          'border-error-700/40 bg-error-50/70 dark:border-error-700/50 dark:bg-error-950/25',
      )
    "
  >
    <span
      data-testid="session-card-icon"
      class="sso-glass-pill grid size-10 shrink-0 place-items-center justify-self-start self-start text-white sm:size-11"
      aria-hidden="true"
    >
      <Smartphone v-if="parsed.device === 'mobile'" class="size-5" />
      <Tablet v-else-if="parsed.device === 'tablet'" class="size-5" />
      <Monitor v-else class="size-5" />
    </span>

    <div data-testid="session-card-content" class="grid min-w-0 gap-3">
      <div data-testid="session-card-title-row" class="flex min-w-0 flex-wrap items-center gap-2">
        <strong class="text-sm">{{ deviceLabel }}</strong>
        <Badge v-if="props.session.is_current" variant="default" class="text-[10px]">
          Sesi ini
        </Badge>
        <Badge v-if="isDormant" variant="outline" class="rounded-full text-[10px]">
          Tidak aktif
        </Badge>
        <Badge variant="secondary" class="text-[10px]">
          {{ props.session.client_count }} aplikasi
        </Badge>
      </div>

      <p data-testid="session-card-clients" class="text-muted-foreground truncate text-xs">
        {{ props.session.client_display_names.join(', ') || '—' }}
      </p>

      <div class="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div class="grid gap-0.5">
          <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
            IP Address
          </span>
          <span data-testid="session-ip-address" class="font-mono tabular-nums">
            {{ locationInfo.ipAddress }}
          </span>
        </div>
        <div class="grid gap-0.5">
          <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
            Lokasi
          </span>
          <span data-testid="session-location">{{ locationInfo.location }}</span>
        </div>
        <div class="grid gap-0.5">
          <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
            Dibuka
          </span>
          <time class="tabular-nums" :datetime="props.session.opened_at">
            {{ formatSessionTimestamp(props.session.opened_at) }}
          </time>
        </div>
        <div class="grid gap-0.5">
          <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
            Terakhir Aktif
          </span>
          <time
            data-testid="session-last-used-relative"
            class="tabular-nums"
            :datetime="props.session.last_used_at"
            :title="formatSessionTimestamp(props.session.last_used_at)"
          >
            {{ relativeLastUsed }}
          </time>
        </div>
      </div>

      <p
        data-testid="session-expires-at"
        class="text-muted-foreground flex items-center gap-1 text-xs"
      >
        <Info class="size-3.5" aria-hidden="true" />
        Token kedaluwarsa: {{ formatSessionTimestamp(props.session.expires_at) }}. Sesi akan
        otomatis berakhir jika tidak ada aktivitas.
      </p>

      <p
        v-if="locationInfo.isForeignIp && !props.session.is_current"
        data-testid="session-risk-warning"
        class="text-error-700 flex items-center gap-1 text-xs dark:text-error-300"
      >
        <AlertTriangle class="size-3.5" aria-hidden="true" />
        Sesi ini dibuka dari IP yang belum pernah digunakan sebelumnya.
      </p>

      <p
        v-if="props.session.is_current"
        data-testid="current-session-helper"
        class="text-muted-foreground text-xs"
      >
        Untuk keluar dari perangkat ini, gunakan tombol Logout di pojok kanan atas.
      </p>
    </div>

    <div class="flex w-full justify-stretch self-start md:justify-end">
      <Badge
        v-if="props.session.is_current"
        data-testid="current-session-badge"
        variant="outline"
        class="rounded-full"
      >
        Sesi Aktif Saat Ini
      </Badge>
      <Button
        v-else
        variant="outline"
        size="sm"
        :disabled="props.pending"
        data-testid="session-revoke-button"
        class="w-full md:w-fit"
        :aria-label="`Akhiri sesi ini: ${deviceLabel}`"
        @click="handleRevoke"
      >
        <Trash2 class="size-4" aria-hidden="true" />
        <span data-testid="session-revoke-label">Akhiri Sesi Ini</span>
      </Button>
    </div>
  </Card>
</template>
