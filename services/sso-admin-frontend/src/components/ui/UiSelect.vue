<script setup lang="ts">
import { cn } from '@/lib/utils'

export type UiSelectOption = {
  readonly value: string
  readonly label: string
}

interface Props {
  readonly modelValue: string
  readonly options: readonly UiSelectOption[]
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly class?: string
}

withDefaults(defineProps<Props>(), {
  disabled: false,
  invalid: false,
  class: undefined,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <select
    :class="cn('ui-control', invalid && 'ui-control--invalid', $props.class)"
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>
