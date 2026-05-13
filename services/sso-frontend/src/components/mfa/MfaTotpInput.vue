<script setup lang="ts">
/**
 * MfaTotpInput — FR-019 / UC-67.
 *
 * Input 6 digit TOTP code dengan auto-focus dan auto-submit saat lengkap.
 */

import { ref, watch } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  complete: []
}>()

const inputRef = ref<HTMLInputElement | null>(null)

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  const value = target.value.replace(/\D/g, '').slice(0, 6)
  emit('update:modelValue', value)

  if (value.length === 6) {
    emit('complete')
  }
}

watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled) {
      inputRef.value?.focus()
    }
  },
)
</script>

<template>
  <div class="grid gap-2">
    <Label for="mfa-totp-code" class="text-body-sm font-medium">
      Kode 6 digit dari authenticator
    </Label>
    <Input
      id="mfa-totp-code"
      ref="inputRef"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      pattern="[0-9]{6}"
      maxlength="6"
      placeholder="000000"
      class="text-center font-mono text-lg tracking-[0.5em]"
      :value="modelValue"
      :disabled="disabled"
      autofocus
      @input="onInput"
    />
  </div>
</template>
