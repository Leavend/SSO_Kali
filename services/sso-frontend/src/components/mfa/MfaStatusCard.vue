<script setup lang="ts">
/**
 * MfaStatusCard — FR-019 / UC-49.
 *
 * Menampilkan status enrollment MFA (aktif/belum aktif)
 * dengan tombol untuk mengaktifkan atau menonaktifkan.
 *
 * Level: Molecule (menggunakan atoms: Badge, Button, Card).
 */

import { ShieldCheck, ShieldOff } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/composables/useI18n'

const { t, locale } = useI18n()
defineProps<{
  enrolled: boolean
  pending: boolean
  lastVerifiedAt: string | null
}>()

const emit = defineEmits<{
  enable: []
  disable: []
}>()
</script>

<template>
  <Card class="relative overflow-hidden">
    <CardHeader class="flex flex-row items-start gap-3 space-y-0">
      <span class="sso-glass-pill grid size-10 shrink-0 place-items-center text-white">
        <ShieldCheck v-if="enrolled" class="size-5" />
        <ShieldOff v-else class="size-5" />
      </span>
      <div class="grid gap-1">
        <CardTitle class="text-sm font-semibold">Multi-Factor Authentication</CardTitle>
        <CardDescription class="flex items-center gap-2">
          <Badge :variant="enrolled ? 'default' : 'secondary'" class="text-[10px]">
            {{ enrolled ? t('common.active') : t('common.not_enabled') }}
          </Badge>
          <span v-if="enrolled && lastVerifiedAt" class="text-muted-foreground text-[10px]">
            {{
              t('portal.mfa.verified_at', {
                date: new Date(lastVerifiedAt).toLocaleDateString(
                  locale === 'id' ? 'id-ID' : 'en-US',
                ),
              })
            }}
          </span>
        </CardDescription>
      </div>
    </CardHeader>
    <CardContent class="grid gap-3">
      <p class="text-muted-foreground text-xs">
        {{
          enrolled ? t('portal.mfa.enabled_description') : t('portal.mfa.disabled_description')
        }}
      </p>
      <Button v-if="!enrolled" size="sm" class="w-fit" :disabled="pending" @click="emit('enable')">
        <ShieldCheck class="size-4" />
        {{ t('portal.mfa.enable') }}
      </Button>
      <Button
        v-else
        variant="destructive"
        size="sm"
        class="w-fit"
        :disabled="pending"
        @click="emit('disable')"
      >
        <ShieldOff class="size-4" />
        {{ t('portal.mfa.disable') }}
      </Button>
    </CardContent>
  </Card>
</template>
