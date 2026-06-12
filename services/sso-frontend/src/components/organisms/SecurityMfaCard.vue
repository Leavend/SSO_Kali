<script setup lang="ts">
/**
 * SecurityMfaCard — MFA status + management CTA.
 */

import { ShieldCheck } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
interface Props {
  isEnabled: boolean
  summary: string
  error: string | null
}

const props = defineProps<Props>()
</script>

<template>
  <Card class="relative overflow-hidden">
    <CardHeader class="flex flex-row items-start gap-3 space-y-0">
      <span class="sso-glass-pill grid size-10 shrink-0 place-items-center text-white">
        <ShieldCheck class="size-5" />
      </span>
      <div class="grid gap-1">
        <CardTitle class="text-sm font-semibold">{{ t('portal.mfa.card_title') }}</CardTitle>
        <CardDescription>
          <Badge :variant="props.isEnabled ? 'default' : 'secondary'" class="text-[10px]">
            {{ props.isEnabled ? t('common.active') : t('common.not_enabled') }}
          </Badge>
        </CardDescription>
      </div>
    </CardHeader>
    <CardContent class="grid gap-3 text-xs">
      <p class="text-muted-foreground">{{ props.summary }}</p>
      <p class="text-muted-foreground">
        {{ t('portal.mfa.manage_description') }}
      </p>
      <div v-if="props.error" role="alert" class="text-destructive">{{ props.error }}</div>
      <div class="flex flex-wrap gap-2">
        <Button as-child size="sm" class="w-fit">
          <RouterLink :to="{ name: 'portal.mfa-settings' }">{{ t('portal.mfa.manage') }}</RouterLink>
        </Button>
        <Button v-if="!props.isEnabled" as-child size="sm" variant="outline" class="w-fit">
          <RouterLink :to="{ name: 'portal.mfa-settings' }">{{ t('portal.mfa.enable') }}</RouterLink>
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
