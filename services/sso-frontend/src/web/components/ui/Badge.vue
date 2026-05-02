<script setup lang="ts">
defineOptions({
  name: 'AdminBadge',
})

withDefaults(defineProps<{
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  size?: 'sm' | 'md' | 'lg'
  dot?: boolean
  pulse?: boolean
}>(), {
  variant: 'neutral',
  size: 'md',
  dot: false,
  pulse: false,
})
</script>

<template>
  <span
    class="badge"
    :class="[
      `badge--${variant}`,
      { [`badge--${size}`]: size !== 'md', 'badge--pulse': pulse }
    ]"
  >
    <span v-if="dot" class="badge__dot" aria-hidden="true" />
    <slot />
  </span>
</template>
