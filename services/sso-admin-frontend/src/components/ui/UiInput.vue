<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  readonly modelValue: string
  readonly type?: string
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly class?: string
}

withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  invalid: false,
  class: undefined,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <input
    :class="cn('ui-control', invalid && 'ui-control--invalid', $props.class)"
    :type="type"
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
