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
  background: linear-gradient(135deg, var(--admin-panel) 0%, var(--admin-panel-muted) 100%);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition:
    color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.quick-action:hover {
  color: var(--admin-ink);
  background: linear-gradient(135deg, var(--admin-panel-muted) 0%, color-mix(in srgb, var(--admin-accent-soft) 24%, var(--admin-panel-muted)) 100%);
  border-color: var(--admin-line-strong);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--admin-shadow-lg);
}

.quick-action:active {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 1px 2px var(--admin-shadow);
  transition:
    box-shadow 0.1s ease,
    transform 0.1s ease;
}

.quick-action:focus-visible {
  outline: 2px solid var(--admin-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--admin-accent) 25%, transparent);
}

.quick-action--primary {
  color: var(--admin-accent-ink);
  background: linear-gradient(135deg, var(--admin-accent) 0%, var(--admin-accent-hover) 100%);
  border-color: var(--admin-accent);
  box-shadow: 0 1px 3px var(--admin-shadow), 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

.quick-action--primary:hover {
  color: var(--admin-accent-ink);
  background: linear-gradient(135deg, var(--admin-accent-hover) 0%, color-mix(in srgb, var(--admin-accent) 90%, var(--admin-accent-hover)) 100%);
  border-color: var(--admin-accent-hover);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--admin-accent) 40%, var(--admin-shadow-lg));
}

.quick-action--primary:focus-visible {
  outline-color: var(--admin-accent-ink);
}

.quick-action__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--radius-md);
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.quick-action:hover .quick-action__icon {
  background: rgba(0, 0, 0, 0.08);
  transform: scale(1.1);
}

.quick-action:active .quick-action__icon {
  transform: scale(1.05);
}

.quick-action--primary .quick-action__icon {
  background: color-mix(in srgb, var(--admin-accent-ink) 15%, transparent);
  box-shadow: 0 0 1px rgba(255, 255, 255, 0.2) inset;
}

.quick-action--primary:hover .quick-action__icon {
  background: color-mix(in srgb, var(--admin-accent-ink) 25%, transparent);
}

.quick-action__label {
  white-space: nowrap;
}

@media (max-width: 640px) {
  .quick-action {
    flex: 1;
    justify-content: center;
    min-width: 0;
    padding: var(--space-3);
  }

  .quick-action__label {
    display: none;
  }

  .quick-action__icon {
    width: 44px;
    height: 44px;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .quick-action {
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }

  .quick-action:hover {
    transform: none;
  }

  .quick-action:active {
    transform: none;
  }

  .quick-action__icon {
    transition: none;
  }

  .quick-action:hover .quick-action__icon {
    transform: none;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .quick-action {
    border-width: 2px;
  }

  .quick-action--primary {
    border-width: 2px;
  }
}
</style>
