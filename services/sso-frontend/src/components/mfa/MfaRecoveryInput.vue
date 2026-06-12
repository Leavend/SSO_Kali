<script setup lang="ts">
/**
 * MfaRecoveryInput — FR-019 / UC-67.
 *
 * Input untuk recovery code (10 karakter alfanumerik).
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value.toUpperCase())
}
</script>

<template>
  <div class="grid gap-2">
    <Label for="mfa-recovery-code" class="text-body-sm font-medium">{{
      t('portal.mfa.recovery_code')
    }}</Label>
    <Input
      id="mfa-recovery-code"
      type="text"
      autocomplete="off"
      placeholder="XXXXXXXXXX"
      class="font-mono tracking-wider"
      :value="modelValue"
      :disabled="disabled"
      autofocus
      @input="onInput"
    />
    <p class="text-muted-foreground text-caption">
      {{ t('portal.mfa.recovery_input_helper') }}
    </p>
  </div>
</template>
