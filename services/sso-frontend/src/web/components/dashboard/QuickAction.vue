<script setup lang="ts">
defineProps<{
  icon: object
  label: string
  href?: string
  action?: string
  variant?: 'default' | 'primary'
}>()

defineEmits<{
  action: [action: string]
}>()
</script>

<template>
  <RouterLink
    v-if="href"
    :to="href"
    class="quick-action"
    :class="{ 'quick-action--primary': variant === 'primary' }"
  >
    <span class="quick-action__icon">
      <component :is="icon" :size="20" aria-hidden="true" />
    </span>
    <span class="quick-action__label">{{ label }}</span>
  </RouterLink>
  <button
    v-else
    type="button"
    class="quick-action"
    :class="{ 'quick-action--primary': variant === 'primary' }"
    @click="action && $emit('action', action)"
  >
    <span class="quick-action__icon">
      <component :is="icon" :size="20" aria-hidden="true" />
    </span>
    <span class="quick-action__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.quick-action {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  color: var(--admin-muted);
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.quick-action:hover {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
  border-color: var(--admin-line-strong);
  transform: translateY(-1px);
}

.quick-action:active {
  transform: translateY(0);
}

.quick-action--primary {
  color: var(--admin-accent-ink);
  background: var(--admin-accent);
  border-color: var(--admin-accent);
}

.quick-action--primary:hover {
  color: var(--admin-accent-ink);
  background: var(--admin-accent-hover);
  border-color: var(--admin-accent-hover);
}

.quick-action__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--admin-panel-muted);
  border-radius: var(--radius-md);
  transition: background-color var(--duration-fast) ease;
}

.quick-action--primary .quick-action__icon {
  background: color-mix(in srgb, var(--admin-accent-ink) 20%, transparent);
}

.quick-action:hover .quick-action__icon {
  background: var(--admin-line);
}

.quick-action--primary:hover .quick-action__icon {
  background: color-mix(in srgb, var(--admin-accent-ink) 30%, transparent);
}

.quick-action__label {
  white-space: nowrap;
}

@media (max-width: 640px) {
  .quick-action {
    flex: 1;
    justify-content: center;
    min-width: 0;
  }

  .quick-action__label {
    display: none;
  }

  .quick-action__icon {
    width: 44px;
    height: 44px;
  }
}
</style>
