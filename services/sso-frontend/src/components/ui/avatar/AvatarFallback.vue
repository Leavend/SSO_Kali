<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AvatarFallback, type AvatarFallbackProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<AvatarFallbackProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <AvatarFallback
    v-bind="props"
    data-slot="avatar-fallback"
    :class="cn('bg-muted flex size-full items-center justify-center', props.class)"
  >
    <slot />
  </AvatarFallback>
</template>
