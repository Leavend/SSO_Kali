<script setup lang="ts">
/**
 * MfaRecoveryInput — FR-019 / UC-67.
 *
 * Input untuk recovery code (10 karakter alfanumerik).
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    <Label for="mfa-recovery-code" class="text-body-sm font-medium">
      Recovery code
    </Label>
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
      Masukkan salah satu recovery code yang kamu simpan saat mendaftar MFA.
    </p>
  </div>
</template>
