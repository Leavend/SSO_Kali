<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { buttonVariants, type ButtonVariants } from './button'

interface Props {
  readonly type?: 'button' | 'submit' | 'reset'
  readonly variant?: ButtonVariants['variant']
  readonly size?: ButtonVariants['size']
  readonly disabled?: boolean
  readonly class?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
  variant: 'primary',
  size: 'md',
  disabled: false,
  class: undefined,
})

const classes = computed(() =>
  cn(buttonVariants({ variant: props.variant, size: props.size }), props.class),
)
</script>

<template>
  <button :class="classes" :type="type" :disabled="disabled">
    <slot />
  </button>
</template>
