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
        'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive && 'text-foreground bg-accent',
      )
    "
  >
    <component :is="props.icon" class="size-4" aria-hidden="true" />
    {{ props.label }}
  </RouterLink>
</template>
