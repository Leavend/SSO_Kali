<script setup lang="ts">
/**
 * PortalNavLink — molecule: nav link dengan icon dan active state.
 */

import type { Component } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  to: string
  label: string
  icon: Component
}>()

const route = useRoute()

const isActive = computed<boolean>(() => route.path.startsWith(props.to))
</script>

<template>
  <RouterLink
    :to="props.to"
    :class="
      cn(
        'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors lg:gap-2 lg:px-3 lg:text-sm',
        isActive && 'text-foreground bg-accent',
      )
    "
  >
    <component :is="props.icon" class="size-4 shrink-0" aria-hidden="true" />
    <span class="min-w-0 truncate">{{ props.label }}</span>
  </RouterLink>
</template>
