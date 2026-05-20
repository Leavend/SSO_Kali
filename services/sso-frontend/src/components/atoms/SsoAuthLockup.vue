<script setup lang="ts">
/**
 * SsoAuthLockup — atom: brand mark + brand name horizontal lockup for the
 * Aurora auth shell. Pinned to the top of every auth route via AuthLayout.
 *
 * Visual contract: compact, weight-balanced, intentionally small so the
 * focus stays on the serif headline that follows.
 */

import type { HTMLAttributes } from 'vue'
import AppBrandMark from '@/components/atoms/AppBrandMark.vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    label?: string
    class?: HTMLAttributes['class']
  }>(),
  { label: 'Dev-SSO', class: undefined },
)
</script>

<template>
  <div :class="cn('flex items-center gap-2', props.class)">
    <AppBrandMark size="sm" />
    <span class="text-base font-semibold tracking-tight text-foreground">
      {{ props.label }}
    </span>
  </div>
</template>
