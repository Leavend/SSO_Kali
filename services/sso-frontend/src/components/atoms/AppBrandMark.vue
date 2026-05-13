<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    size?: Size
    class?: HTMLAttributes['class']
  }>(),
  { size: 'md', class: undefined },
)

const iconSize = {
  sm: 14,
  md: 18,
  lg: 22,
}[props.size]

const boxSize = {
  sm: 'size-7',
  md: 'size-9',
  lg: 'size-11',
}[props.size]
</script>

<template>
  <span
    :class="
      cn(
        'bg-primary text-primary-foreground grid place-items-center rounded-xl shadow-sm',
        boxSize,
        props.class,
      )
    "
    aria-hidden="true"
  >
    <ShieldCheck :size="iconSize" />
  </span>
</template>
