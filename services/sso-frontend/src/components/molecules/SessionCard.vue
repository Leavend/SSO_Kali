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
  <Card class="flex flex-row items-center gap-4 px-6 py-4">
    <span
      class="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg"
      aria-hidden="true"
    >
      <Smartphone v-if="parsed.device === 'mobile'" class="size-5" />
      <Tablet v-else-if="parsed.device === 'tablet'" class="size-5" />
      <Monitor v-else class="size-5" />
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <strong class="text-sm">{{ deviceLabel }}</strong>
        <Badge v-if="props.session.is_current" variant="default" class="text-[10px]">Sesi ini</Badge>
        <Badge variant="secondary" class="text-[10px]">{{ props.session.client_count }} aplikasi</Badge>
      </div>
      <p class="text-muted-foreground mt-1 text-xs">
        {{ props.session.client_display_names.join(', ') || '—' }}
      </p>
      <p class="text-muted-foreground mt-1 text-xs">
        Dibuka {{ formatDate(props.session.opened_at) }} · Terakhir aktif {{ formatDate(props.session.last_used_at) }}
      </p>
    </div>
    <Button
      variant="outline"
      size="sm"
      :disabled="props.pending || Boolean(props.session.is_current)"
      :aria-label="`Cabut sesi ${deviceLabel}`"
      @click="emit('revoke', props.session.session_id)"
    >
      <Trash2 class="size-4" aria-hidden="true" />
      Cabut Sesi
    </Button>
  </Card>
</template>
