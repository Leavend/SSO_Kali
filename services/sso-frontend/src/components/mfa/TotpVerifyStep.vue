<script setup lang="ts">
/**
 * TotpVerifyStep — FR-019 / UC-49.
 *
 * Step verifikasi kode TOTP 6-digit setelah scan QR.
 * Auto-submit saat 6 digit terisi.
 *
 * Level: Molecule (menggunakan MfaTotpInput atom).
 */

import { ref } from 'vue'
import MfaTotpInput from '@/components/mfa/MfaTotpInput.vue'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
defineProps<{
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{
  verify: [code: string]
}>()

const code = ref('')

function handleComplete(): void {
  if (code.value.length === 6) {
    emit('verify', code.value)
  }
}

function handleSubmit(): void {
  if (code.value.length === 6) {
    emit('verify', code.value)
  }
}
</script>

<template>
  <div class="grid gap-4">
    <div class="grid gap-2 text-center">
      <h3 class="text-sm font-semibold">{{ t('portal.mfa.verify_code') }}</h3>
      <p class="text-muted-foreground text-xs">
        {{ t('portal.mfa.verify_description') }}
      </p>
    </div>

    <form class="grid gap-3" @submit.prevent="handleSubmit">
      <MfaTotpInput v-model="code" :disabled="pending" @complete="handleComplete" />

      <p v-if="error" class="text-destructive text-center text-xs" role="alert">
        {{ error }}
      </p>

      <Button type="submit" size="sm" class="w-full" :disabled="pending || code.length < 6">
        {{ pending ? t('common.verifying') : t('common.verify') }}
      </Button>
    </form>
  </div>
</template>
