<script setup lang="ts">
/**
 * SecurityPasswordForm — molecule for mobile-safe password updates.
 */

import { computed } from 'vue'
import { Check, KeyRound, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import SsoPasswordField from '@/components/molecules/SsoPasswordField.vue'
import { cn } from '@/lib/utils'
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
}

interface Emits {
  (e: 'update:field', field: keyof ChangePasswordPayload, value: string): void
  (e: 'submit'): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const strengthBarClass = computed<string>(() => {
  if (props.strengthSummary.level === 'strong') return 'bg-success-700'
  if (props.strengthSummary.level === 'fair') return 'bg-warning-800'
  if (props.strengthSummary.level === 'weak') return 'bg-error-700'
  return 'bg-muted-foreground/30'
})

function updateField(field: keyof ChangePasswordPayload, value: string): void {
  emit('update:field', field, value)
}

function handleSubmit(): void {
  emit('submit')
}

function handleCancel(): void {
  emit('cancel')
}
</script>

<template>
  <form class="grid gap-4" @submit.prevent="handleSubmit">
    <div class="grid gap-4 md:grid-cols-3">
      <SsoPasswordField
        id="current_password"
        :model-value="props.form.current_password"
        label="Password Saat Ini"
        autocomplete="current-password"
        :error="props.errors.current_password"
        :disabled="props.isPending"
        required
        @update:model-value="updateField('current_password', $event)"
      />

      <SsoPasswordField
        id="new_password"
        :model-value="props.form.new_password"
        label="Password Baru"
        autocomplete="new-password"
        :error="props.errors.new_password"
        :disabled="props.isPending"
        required
        @update:model-value="updateField('new_password', $event)"
      />

      <SsoPasswordField
        id="new_password_confirmation"
        :model-value="props.form.new_password_confirmation"
        label="Konfirmasi Password Baru"
        autocomplete="new-password"
        :error="props.errors.password_confirmation"
        :disabled="props.isPending"
        required
        @update:model-value="updateField('new_password_confirmation', $event)"
      />
    </div>

    <div
      class="grid gap-3 rounded-[var(--radius-glass-xl)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-primary)] p-3"
    >
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-[var(--text-primary)]">Kekuatan password</span>
        <span data-testid="password-strength-label" class="text-xs font-semibold">
          {{ props.strengthSummary.label }} · {{ props.strengthSummary.score }}/5
        </span>
      </div>
      <div
        class="h-2 overflow-hidden rounded-full bg-[var(--glass-bg-elevated)]"
        aria-hidden="true"
      >
        <div
          data-testid="password-strength-bar"
          :class="cn('h-full rounded-full transition-all', strengthBarClass)"
          :style="{ width: `${props.strengthSummary.percentage}%` }"
        />
      </div>
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-live="polite">
        <li
          v-for="requirement in props.strengthRequirements"
          :key="requirement.label"
          class="flex items-center gap-1.5 text-xs"
          :class="requirement.met ? 'text-success-700' : 'text-muted-foreground'"
        >
          <Check v-if="requirement.met" class="size-3.5" aria-hidden="true" />
          <X v-else class="size-3.5" aria-hidden="true" />
          <span>{{ requirement.label }}</span>
        </li>
      </ul>
      <p class="sr-only" aria-live="polite">
        Kebutuhan tersisa:
        {{ props.strengthItems.length > 0 ? props.strengthItems.join(', ') : 'terpenuhi' }}.
      </p>
    </div>

    <p v-if="props.errors._general" class="text-destructive text-xs">
      {{ props.errors._general }}
    </p>

    <p class="text-muted-foreground text-xs" data-testid="password-required-note">
      * Semua kolom wajib diisi
    </p>

    <div
      data-testid="password-form-actions"
      class="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end"
    >
      <Button
        type="submit"
        size="sm"
        class="w-full sm:w-fit"
        :disabled="props.isPending || !props.canSubmit"
      >
        <KeyRound class="size-4" aria-hidden="true" />
        {{ props.isPending ? 'Menyimpan...' : 'Simpan Password' }}
      </Button>
      <Button type="button" variant="ghost" size="sm" class="w-full sm:w-fit" @click="handleCancel">
        Batal
      </Button>
    </div>
  </form>
</template>
