<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import { ShieldCheck, AlertCircle, History } from 'lucide-vue-next'
import { useAuditStore } from '@/features/audit/stores/audit.store'
import type { RetentionStatusItem } from '../types'

const store = useAuditStore()
const { t } = useI18n()
const dateFormat = useDateFormat()

function retentionWindowLabel(item: RetentionStatusItem): string {
  if (item.window.days !== undefined) return `${item.window.days} hari`
  if (item.window.hours !== undefined) return `${item.window.hours} jam`
  if (item.window.seconds !== undefined) return `${item.window.seconds} detik`
  return 'No window evidence'
}

function retentionNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? 'No evidence' : String(value)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Integrity Card -->
    <section class="ui-card space-y-4" aria-labelledby="integrity-title">
      <div
        class="flex items-center justify-between flex-wrap gap-4 border-b border-border pb-4"
      >
        <div class="flex items-center gap-3">
          <ShieldCheck class="size-6 text-emerald-500" v-if="store.integrity?.verified" />
          <AlertCircle class="size-6 text-amber-500" v-else />
          <div>
            <h2 id="integrity-title" class="text-lg font-bold">
              {{ t('audit.integrity_title') }}
            </h2>
            <p class="text-sm text-muted-foreground">
              Verification status of audit trail security log chains.
            </p>
          </div>
        </div>
        <span
          class="audit-badge"
          :class="store.integrity?.verified ? 'audit-badge--success' : 'audit-badge--danger'"
        >
          {{ store.integrity?.verified ? 'Integrity verified' : 'Integrity needs review' }}
        </span>
      </div>

      <dl class="audit-grid audit-grid-2">
        <div class="bg-muted p-4 rounded-xl border border-border flex flex-col gap-1">
          <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {{ t('audit.checked_events') }}
          </dt>
          <dd class="text-2xl font-black text-foreground">
            {{ store.integrity?.checked_events ?? 'No evidence' }}
          </dd>
        </div>
        <div class="bg-muted p-4 rounded-xl border border-border flex flex-col gap-1">
          <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {{ t('audit.latest_hash') }}
          </dt>
          <dd class="text-sm font-mono text-foreground break-anywhere leading-relaxed pt-1">
            {{ store.integrity?.latest_event_hash ?? 'No evidence' }}
          </dd>
        </div>
      </dl>
    </section>

    <!-- Retention Status -->
    <section class="ui-card space-y-4" aria-labelledby="retention-title">
      <div class="flex items-center gap-3">
        <History class="size-5 text-primary" />
        <div>
          <h2 id="retention-title" class="text-lg font-bold">
            {{ t('audit.retention_title') }}
          </h2>
          <p class="text-sm text-muted-foreground">{{ t('audit.retention_desc') }}</p>
        </div>
      </div>

      <div class="audit-grid audit-grid-3 pt-2">
        <div
          v-for="item in store.retentionStatus?.items ?? []"
          :key="item.category"
          class="bg-muted p-4 rounded-xl border border-border space-y-3 audit-card-premium"
        >
          <div class="border-b border-border pb-2">
            <strong class="text-sm font-bold text-foreground">{{ item.label }}</strong>
          </div>
          <dl class="space-y-2 text-xs font-semibold">
            <div class="flex justify-between items-center border-b border-border/50 pb-1">
              <dt class="text-muted-foreground">{{ t('audit.window') }}</dt>
              <dd class="text-foreground text-right">{{ retentionWindowLabel(item) }}</dd>
            </div>
            <div class="flex justify-between items-center border-b border-border/50 pb-1">
              <dt class="text-muted-foreground">{{ t('audit.schedule') }}</dt>
              <dd class="text-foreground text-right">{{ item.schedule ?? 'No schedule' }}</dd>
            </div>
            <div class="flex justify-between items-center border-b border-border/50 pb-1">
              <dt class="text-muted-foreground">{{ t('audit.last_pruned') }}</dt>
              <dd class="text-foreground text-right">
                {{
                  item.last_pruned_at
                    ? dateFormat.smart(item.last_pruned_at)
                    : t('audit.not_pruned')
                }}
              </dd>
            </div>
            <div class="flex justify-between items-center border-b border-border/50 pb-1">
              <dt class="text-muted-foreground">{{ t('audit.pruned_rows') }}</dt>
              <dd
                class="text-foreground font-mono bg-secondary px-2 py-0.5 rounded text-right"
              >
                {{ retentionNumber(item.last_pruned_count) }}
              </dd>
            </div>
            <div class="flex justify-between items-center">
              <dt class="text-muted-foreground">{{ t('audit.candidate_rows') }}</dt>
              <dd
                class="text-foreground font-mono bg-secondary px-2 py-0.5 rounded text-right"
              >
                {{ retentionNumber(item.candidate_count) }}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <p
        v-if="(store.retentionStatus?.items.length ?? 0) === 0"
        class="text-sm text-muted-foreground pt-2 italic"
      >
        {{ t('audit.no_retention') }}
      </p>
    </section>
  </div>
</template>
