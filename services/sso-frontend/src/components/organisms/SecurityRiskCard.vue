<script setup lang="ts">
/**
 * SecurityRiskCard — login risk score context with gauge + CTA.
 */

import { Fingerprint } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { RiskPresentation } from '@/lib/portal-security'

interface Props {
  risk: RiskPresentation
}

const props = defineProps<Props>()
</script>

<template>
  <Card class="relative overflow-hidden" data-testid="risk-card">
    <CardHeader class="flex flex-row items-start gap-3 space-y-0">
      <span class="sso-glass-pill grid size-10 shrink-0 place-items-center text-white">
        <Fingerprint class="size-5" aria-hidden="true" />
      </span>
      <div class="grid gap-1">
        <CardTitle class="text-sm font-semibold">Risiko Login</CardTitle>
        <CardDescription class="flex flex-wrap items-center gap-2 text-xs">
          Skor risiko:
          <strong class="text-foreground">{{ props.risk.scoreText }}</strong>
          <Badge :variant="props.risk.badgeVariant" class="text-[10px]">
            {{ props.risk.label }}
          </Badge>
        </CardDescription>
      </div>
    </CardHeader>
    <CardContent class="grid gap-3 text-xs">
      <div class="grid gap-1.5">
        <div class="flex items-center justify-between gap-3">
          <span class="text-muted-foreground">Skala 0–100</span>
          <span :class="cn('font-semibold', props.risk.labelClass)">{{ props.risk.label }}</span>
        </div>
        <div
          class="h-2 overflow-hidden rounded-full bg-[var(--glass-bg-elevated)]"
          role="meter"
          aria-label="Skor risiko login"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="props.risk.normalizedScore"
        >
          <div
            data-testid="risk-score-bar"
            :class="cn('h-full rounded-full transition-all', props.risk.barClass)"
            :style="{ width: `${props.risk.normalizedScore}%` }"
          />
        </div>
      </div>
      <p class="text-muted-foreground">{{ props.risk.description }}</p>
      <Button as-child size="sm" variant="outline" class="w-fit">
        <RouterLink :to="{ name: 'portal.sessions' }">Lihat Detail Risiko</RouterLink>
      </Button>
    </CardContent>
  </Card>
</template>
