<script setup lang="ts">
/**
 * AppAvatar — molecule untuk avatar user dengan fallback initials.
 */

import { computed } from 'vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    name?: string | null
    email?: string | null
    size?: 'sm' | 'md' | 'lg'
    class?: string
  }>(),
  { size: 'md', name: null, email: null, class: undefined },
)

const initials = computed<string>(() => {
  const source = props.name ?? props.email ?? ''
  const letters = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((piece) => piece.charAt(0).toUpperCase())
    .join('')
  return letters || 'U'
})

const sizeClass = computed<string>(() =>
  props.size === 'sm' ? 'size-7' : props.size === 'lg' ? 'size-10' : 'size-8',
)
</script>

<template>
  <Avatar :class="cn(sizeClass, props.class)">
    <AvatarFallback>{{ initials }}</AvatarFallback>
  </Avatar>
</template>
