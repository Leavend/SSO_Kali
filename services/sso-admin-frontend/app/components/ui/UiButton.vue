<script setup lang="ts">
import { buttonVariants, type ButtonVariants } from './button'

interface Props {
  readonly type?: 'button' | 'submit' | 'reset'
  readonly variant?: ButtonVariants['variant']
  readonly size?: ButtonVariants['size']
  readonly disabled?: boolean
  readonly class?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
  variant: 'primary',
  size: 'md',
  disabled: false,
  class: undefined,
})
</script>

<template>
  <button
    :class="[buttonVariants({ variant: props.variant, size: props.size }), props.class]"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: var(--ctl-h);
  padding: 0 14px;
  font: 500 0.8125rem/1 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.ui-btn:disabled {
  opacity: 0.5;
  pointer-events: none;
}
.ui-btn--primary {
  color: var(--accent-fg);
  background: var(--accent);
  border-color: var(--accent);
}
.ui-btn--primary:hover {
  background: var(--accent-600);
  border-color: var(--accent-600);
}
.ui-btn--secondary {
  color: var(--fg);
  background: var(--card);
  border-color: var(--border-strong);
}
.ui-btn--secondary:hover {
  background: var(--muted);
}
.ui-btn--danger {
  color: var(--danger-fg);
  background: var(--danger);
  border-color: var(--danger);
}
.ui-btn--danger:hover {
  background: var(--danger-soft-fg);
  border-color: var(--danger-soft-fg);
}
.ui-btn--ghost {
  color: var(--fg);
  background: transparent;
  border-color: transparent;
}
.ui-btn--ghost:hover {
  background: var(--muted);
}
.ui-btn--sm {
  min-height: 30px;
  padding: 0 10px;
  font-size: 0.75rem;
}
.ui-btn--md {
  min-height: var(--ctl-h);
}
.ui-btn--lg {
  min-height: 42px;
  padding: 0 18px;
}
.ui-btn--icon {
  width: var(--ctl-h);
  height: var(--ctl-h);
  padding: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ui-btn {
    transition: none;
  }
}
</style>
