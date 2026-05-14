<script setup lang="ts">
/**
 * SessionCard — molecule: visual kartu sesi aktif + tombol revoke.
 */

import { computed } from 'vue'
import { Monitor, Smartphone, Tablet, Trash2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { UserSessionSummary } from '@/types/profile.types'
import { parseUserAgent } from '@/lib/parse-user-agent'

const props = defineProps<{
  session: UserSessionSummary
  pending: boolean
}>()

const emit = defineEmits<{
  (e: 'revoke', sessionId: string): void
}>()

const parsed = computed(() => parseUserAgent(props.session.user_agent))

const deviceLabel = computed<string>(() => {
  const parts: string[] = []
  if (parsed.value.browser !== 'Unknown') parts.push(parsed.value.browser)
  if (parsed.value.os !== 'Unknown') parts.push(parsed.value.os)
  return parts.length > 0 ? parts.join(' · ') : 'Perangkat tidak dikenal'
})

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('id-ID')
  } catch {
    return value
  }
}
</script>

<template>
  <Card
    data-testid="session-card"
    class="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-start gap-3 px-3 py-4 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-5 lg:px-6"
  >
    <span
      data-testid="session-card-icon"
      class="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center self-start justify-self-center rounded-lg sm:size-11"
      aria-hidden="true"
    >
      <Smartphone v-if="parsed.device === 'mobile'" class="size-5" />
      <Tablet v-else-if="parsed.device === 'tablet'" class="size-5" />
      <Monitor v-else class="size-5" />
    </span>
    <div data-testid="session-card-content" class="grid min-w-0 gap-1.5">
      <div data-testid="session-card-title-row" class="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
        <strong class="min-w-0 truncate text-sm leading-tight">{{ deviceLabel }}</strong>
        <Badge v-if="props.session.is_current" variant="default" class="shrink-0 text-[10px]">Sesi ini</Badge>
        <Badge variant="secondary" class="shrink-0 text-[10px]">{{ props.session.client_count }} aplikasi</Badge>
      </div>
      <p data-testid="session-card-clients" class="text-muted-foreground min-w-0 truncate text-xs leading-relaxed">
        {{ props.session.client_display_names.join(', ') || '—' }}
      </p>
      <div
        data-testid="session-card-metadata"
        class="text-muted-foreground grid min-w-0 gap-1 text-xs leading-relaxed sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:gap-x-3"
      >
        <span data-testid="session-opened-at" class="min-w-0 truncate tabular-nums">
          Dibuka {{ formatDate(props.session.opened_at) }}
        </span>
        <span data-testid="session-last-used-at" class="min-w-0 truncate tabular-nums">
          Terakhir aktif {{ formatDate(props.session.last_used_at) }}
        </span>
        <span data-testid="session-expires-at" class="min-w-0 truncate tabular-nums sm:col-span-2 lg:col-span-1">
          Berakhir {{ formatDate(props.session.expires_at) }}
        </span>
      </div>
    </div>
    <Button
      data-testid="session-revoke-button"
      variant="outline"
      size="icon"
      class="session-card__revoke-button size-10 shrink-0 justify-self-end px-0 md:h-9 md:w-fit md:px-3"
      :disabled="props.pending || Boolean(props.session.is_current)"
      :aria-label="`Cabut sesi ${deviceLabel}`"
      @click="emit('revoke', props.session.session_id)"
    >
      <Trash2 class="size-4" aria-hidden="true" />
      <span data-testid="session-revoke-label" class="session-card__revoke-label">Cabut Sesi</span>
    </Button>
  </Card>
</template>

<style scoped>
.session-card__revoke-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  white-space: nowrap;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

@media (min-width: 768px) {
  .session-card__revoke-label {
    position: static;
    width: auto;
    height: auto;
    padding: 0;
    margin: 0;
    overflow: visible;
    clip: auto;
  }
}
</style>
