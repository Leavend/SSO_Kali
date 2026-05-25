<script setup lang="ts">
/**
 * SecurityPasswordSection — standalone password update section.
 */

import { KeyRound } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import SecurityPasswordForm from '@/components/molecules/SecurityPasswordForm.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { formatPortalDateTime } from '@/lib/portal-security'
import type { ChangePasswordPayload } from '@/types/profile.types'
import type { PasswordRequirementStatus, PasswordStrengthSummary } from '@/lib/auth/password-policy'

interface Props {
  form: ChangePasswordPayload
  errors: Record<string, string>
  strengthItems: readonly string[]
  strengthRequirements: readonly PasswordRequirementStatus[]
  strengthSummary: PasswordStrengthSummary
  isPending: boolean
  canSubmit: boolean
  success: string | null
  error: string | null
  lastSeen: string | null
  showForm: boolean
}

interface Emits {
  (e: 'update:field', field: keyof ChangePasswordPayload, value: string): void
  (e: 'submit'): void
  (e: 'reset'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

function updatePasswordField(field: keyof ChangePasswordPayload, value: string): void {
  emit('update:field', field, value)
}

function handleSubmit(): void {
  emit('submit')
}

function handleReset(): void {
  emit('reset')
}
</script>

<template>
  <Card class="relative overflow-hidden" data-testid="password-section">
    <CardHeader class="flex flex-row items-start gap-3 space-y-0">
      <span class="sso-glass-pill grid size-10 shrink-0 place-items-center text-white">
        <KeyRound class="size-5" />
      </span>
      <div class="grid gap-1">
        <CardTitle class="text-sm font-semibold">Password</CardTitle>
        <CardDescription class="text-xs">
          Terakhir aktif: {{ formatPortalDateTime(props.lastSeen) }}
        </CardDescription>
      </div>
    </CardHeader>
    <CardContent class="grid gap-3">
      <p class="text-muted-foreground text-xs">
        Perbarui password secara berkala. Setelah berhasil, semua sesi lain akan otomatis keluar dan
        kami mengirimkan notifikasi ke email kamu.
      </p>
      <SsoAlertBanner v-if="props.success" tone="success" :message="props.success" />
      <SsoAlertBanner v-if="props.error" tone="error" :message="props.error" />
      <SecurityPasswordForm
        v-if="props.showForm"
        :form="props.form"
        :errors="props.errors"
        :strength-items="props.strengthItems"
        :strength-requirements="props.strengthRequirements"
        :strength-summary="props.strengthSummary"
        :is-pending="props.isPending"
        :can-submit="props.canSubmit"
        @update:field="updatePasswordField"
        @submit="handleSubmit"
        @cancel="handleReset"
      />
      <Button v-else variant="outline" size="sm" class="w-fit" @click="handleReset">
        <KeyRound class="size-4" />
        Ganti Password Lagi
      </Button>
    </CardContent>
  </Card>
</template>
