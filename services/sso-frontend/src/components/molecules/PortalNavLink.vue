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
  shortLabel?: string
}>()

const route = useRoute()

const isActive = computed<boolean>(() => route.path.startsWith(props.to))
</script>

<template>
  <RouterLink
    :to="props.to"
    :aria-label="props.label"
    :class="
      cn(
        'portal-nav-pill relative isolate inline-flex min-h-10 shrink-0 items-center gap-2 overflow-hidden rounded-full px-3.5 py-2 text-sm font-medium',
        isActive && 'portal-nav-pill--active',
      )
    "
  >
    <component :is="props.icon" class="size-4" aria-hidden="true" />
    <span v-if="props.shortLabel" data-testid="portal-nav-label-short" class="xl:hidden">
      {{ props.shortLabel }}
    </span>
    <span
      data-testid="portal-nav-label-full"
      :class="props.shortLabel ? 'hidden xl:inline' : undefined"
    >
      {{ props.label }}
    </span>
  </RouterLink>
</template>
