<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  readonly modelValue: string
  readonly rows?: number
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly class?: string
}

withDefaults(defineProps<Props>(), {
  rows: 4,
  disabled: false,
  invalid: false,
  class: undefined,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <textarea
    :class="cn('ui-control ui-control--textarea', invalid && 'ui-control--invalid', $props.class)"
    :value="modelValue"
    :rows="rows"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
