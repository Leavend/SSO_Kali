<script setup lang="ts">
import { Primitive } from 'reka-ui'
import { cn } from '@/lib/utils'
import { badgeVariants, type BadgeVariants } from '.'

type BadgeAs = string | object

interface Props {
  as?: BadgeAs
  asChild?: boolean
  variant?: BadgeVariants['variant']
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  as: 'span',
})
</script>

<template>
  <Primitive
    data-slot="badge"
    :as="as"
    :as-child="asChild"
    :class="cn(badgeVariants({ variant }), props.class)"
  >
    <slot />
  </Primitive>
</template>
