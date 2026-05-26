<script setup lang="ts">
/**
 * SecurityAuditLogCard — human-readable audit events + risk highlighting.
 */

import { computed } from 'vue'
import { AlertTriangle, ShieldCheck } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatPortalDateTime, presentAuditEvent } from '@/lib/portal-security'
import type { AuditEventPresentation } from '@/lib/portal-security'
import type { AuditEvent } from '@/types/audit.types'

interface Props {
  events: readonly AuditEvent[]
  knownLoginIps: ReadonlySet<string>
  isPending: boolean
}

interface PresentedAuditEvent {
  readonly event: AuditEvent
  readonly presentation: AuditEventPresentation
}

const props = defineProps<Props>()
const presentedEvents = computed<readonly PresentedAuditEvent[]>(() =>
  props.events.map((event) => ({
    event,
    presentation: presentAuditEvent(event, props.knownLoginIps),
  })),
)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-base font-semibold">Riwayat Keamanan Terbaru</CardTitle>
      <CardDescription>Aktivitas login, logout, dan perubahan keamanan akun.</CardDescription>
    </CardHeader>
    <CardContent>
      <div v-if="props.isPending" class="grid gap-2">
        <Skeleton v-for="i in 3" :key="i" class="h-10 w-full rounded-lg" />
      </div>
      <div
        v-else-if="props.events.length === 0"
        class="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm"
      >
        <ShieldCheck class="text-muted-foreground/50 size-8" />
        Belum ada riwayat keamanan.
      </div>
      <ul v-else class="grid min-w-0 gap-2" data-testid="audit-events-list">
        <li
          v-for="item in presentedEvents"
          :key="item.event.id"
          :class="
            cn(
              'flex flex-col gap-1 rounded-[var(--radius-glass-xl)] border px-3 py-2.5 shadow-[var(--shadow-glass-sm)] backdrop-blur-[var(--glass-blur-sm)] sm:flex-row sm:items-center sm:justify-between sm:gap-2',
              item.presentation.rowClass,
            )
          "
          data-testid="audit-event-row"
        >
          <div class="grid min-w-0 gap-1">
            <div
              class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
              data-testid="audit-event-meta"
            >
              <Badge
                :variant="item.presentation.badgeVariant"
                :class="cn('truncate font-medium', item.presentation.badgeClass)"
                data-testid="audit-event-badge"
              >
                <AlertTriangle
                  v-if="item.presentation.severity !== 'normal'"
                  class="size-3"
                  aria-hidden="true"
                />
                {{ item.presentation.label }}
              </Badge>
              <span
                class="text-muted-foreground whitespace-nowrap text-xs"
                data-testid="audit-event-ip-address"
              >
                {{ item.event.ip_address ?? '—' }}
              </span>
            </div>
            <p
              v-if="item.presentation.severity !== 'normal'"
              :class="cn('text-[11px]', item.presentation.iconClass)"
              data-testid="audit-event-helper"
            >
              {{ item.presentation.helper }}
            </p>
          </div>
          <time
            class="text-muted-foreground text-[11px] tabular-nums sm:text-xs"
            :datetime="item.event.created_at"
          >
            {{ formatPortalDateTime(item.event.created_at) }}
          </time>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
