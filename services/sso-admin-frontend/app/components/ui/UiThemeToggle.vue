<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { useTheme } from './useTheme'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <button
    class="ui-icon-button"
    type="button"
    :aria-label="isDark ? 'Use light theme' : 'Use dark theme'"
    @click="toggleTheme"
  >
    <Sun v-if="isDark" :size="18" aria-hidden="true" />
    <Moon v-else :size="18" aria-hidden="true" />
  </button>
</template>

<style scoped>
.ui-icon-button {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--fg-2);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}
.ui-icon-button:hover {
  background: var(--muted);
  color: var(--fg);
}
.ui-icon-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .ui-icon-button {
    transition: none;
  }
}
</style>
