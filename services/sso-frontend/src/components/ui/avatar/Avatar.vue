<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AvatarRoot, type AvatarRootProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<AvatarRootProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <AvatarRoot
    v-bind="props"
    data-slot="avatar"
    :class="
      cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        props.class,
      )
    "
  >
    <slot />
  </AvatarRoot>
</template>
