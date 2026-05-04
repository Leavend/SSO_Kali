<script setup lang="ts">
withDefaults(defineProps<{
  as?: string
  padding?: 'md' | 'lg'
  interactive?: boolean
}>(), {
  as: 'section',
  padding: 'lg',
  interactive: false,
})
</script>

<template>
  <component
    :is="as"
    class="dashboard-surface"
    :class="[
      `dashboard-surface--${padding}`,
      { 'dashboard-surface--interactive': interactive }
    ]"
  >
    <slot />
  </component>
</template>

<style scoped>
.dashboard-surface {
  min-width: 0;
  color: var(--admin-ink);
  background: linear-gradient(135deg, var(--admin-panel) 0%, color-mix(in srgb, var(--admin-accent-soft) 6%, var(--admin-panel)) 100%);
  border: 1px solid color-mix(in srgb, var(--admin-line) 18%, transparent);
  border-radius: var(--radius-2xl);
  box-shadow: 0 1px 2px var(--admin-shadow);
}

.dashboard-surface--md {
  padding: var(--space-5);
}

.dashboard-surface--lg {
  padding: var(--space-6);
}

.dashboard-surface--interactive {
  transition:
    border-color var(--duration-fast) ease,
    background-color var(--duration-fast) ease,
    transform var(--duration-fast) ease;
}

@media (hover: hover) and (pointer: fine) {
  .dashboard-surface--interactive:hover {
    border-color: color-mix(in srgb, var(--admin-accent) 32%, transparent);
    transform: translateY(-2px);
  }
}

@media (max-width: 640px) {
  .dashboard-surface--md,
  .dashboard-surface--lg {
    padding: var(--space-5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-surface--interactive {
    transition: none;
  }

  .dashboard-surface--interactive:hover {
    transform: none;
  }
}

@media (prefers-contrast: high) {
  .dashboard-surface {
    border-width: 2px;
  }
}
</style>
