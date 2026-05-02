<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

defineOptions({
  name: 'AdminDropdown',
})

defineProps<{
  align?: 'left' | 'right'
}>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

function toggle() {
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    close()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="dropdownRef" class="dropdown">
    <button
      type="button"
      class="dropdown__trigger"
      :aria-expanded="isOpen"
      aria-haspopup="true"
      @click="toggle"
    >
      <slot name="trigger" />
      <ChevronDown
        :size="16"
        class="dropdown__chevron"
        :class="{ 'dropdown__chevron--open': isOpen }"
        aria-hidden="true"
      />
    </button>

    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="dropdown__menu"
        :class="{ 'dropdown__menu--left': align === 'left' }"
        role="menu"
      >
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dropdown {
  position: relative;
  display: inline-flex;
}

.dropdown__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.dropdown__chevron {
  transition: transform var(--duration-fast) ease;
}

.dropdown__chevron--open {
  transform: rotate(180deg);
}

.dropdown__menu {
  position: absolute;
  top: calc(100% + var(--space-2));
  right: 0;
  z-index: 50;
  min-width: 200px;
  padding: var(--space-2);
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 40px var(--admin-shadow-lg);
}

.dropdown__menu--left {
  right: auto;
  left: 0;
}

/* Dropdown items in default slot */
.dropdown__menu :deep([data-dropdown-item]) {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  color: var(--admin-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-fast) ease, color var(--duration-fast) ease;
}

.dropdown__menu :deep([data-dropdown-item]:hover) {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
}

.dropdown__menu :deep([data-dropdown-item--danger]) {
  color: var(--status-danger);
}

.dropdown__menu :deep([data-dropdown-item--danger]:hover) {
  background: var(--status-danger-soft);
}

.dropdown__menu :deep([data-dropdown-divider]) {
  height: 1px;
  margin: var(--space-2) 0;
  background: var(--admin-line);
}

/* Transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
