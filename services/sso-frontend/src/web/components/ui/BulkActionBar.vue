<script setup lang="ts">
import type { Component } from 'vue'
import { Trash2, Download } from 'lucide-vue-next'

export interface BulkAction {
  label: string
  icon?: Component
  variant?: 'default' | 'danger'
  action: string
}

withDefaults(defineProps<{
  selectedCount: number
  actions?: BulkAction[]
}>(), {
  actions: () => [
    { label: 'Export', icon: Download, action: 'export' },
    { label: 'Hapus', icon: Trash2, variant: 'danger', action: 'delete' },
  ],
})

defineEmits<{
  action: [action: string]
  'clear': []
}>()
</script>

<template>
  <Transition name="bulk-bar">
    <div v-if="selectedCount > 0" class="bulk-action-bar">
      <div class="bulk-action-bar__info">
        <span class="bulk-action-bar__count">
          {{ selectedCount }} item{{ selectedCount > 1 ? 's' : '' }} dipilih
        </span>
        <button
          type="button"
          class="bulk-action-bar__clear"
          @click="$emit('clear')"
        >
          Batalkan
        </button>
      </div>

      <div class="bulk-action-bar__actions">
        <slot name="actions">
          <button
            v-for="bulkAction in actions"
            :key="bulkAction.action"
            type="button"
            class="button"
            :class="bulkAction.variant === 'danger' ? 'button--danger' : 'button--secondary'"
            @click="$emit('action', bulkAction.action)"
          >
            <component
              v-if="bulkAction.icon"
              :is="bulkAction.icon"
              :size="16"
              aria-hidden="true"
            />
            {{ bulkAction.label }}
          </button>
        </slot>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bulk-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--admin-accent-soft);
  border: 1px solid var(--admin-accent);
  border-radius: var(--radius-lg);
}

.bulk-action-bar__info {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.bulk-action-bar__count {
  color: var(--admin-accent);
  font-size: var(--text-sm);
  font-weight: 700;
}

.bulk-action-bar__clear {
  padding: 0;
  color: var(--admin-muted);
  background: transparent;
  border: 0;
  font-size: var(--text-sm);
  text-decoration: underline;
  cursor: pointer;
}

.bulk-action-bar__clear:hover {
  color: var(--admin-ink);
}

.bulk-action-bar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* Transition */
.bulk-bar-enter-active,
.bulk-bar-leave-active {
  transition: all 0.2s var(--ease-out);
}

.bulk-bar-enter-from,
.bulk-bar-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 640px) {
  .bulk-action-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .bulk-action-bar__actions {
    flex-direction: column;
  }

  .bulk-action-bar__actions .button {
    width: 100%;
    justify-content: center;
  }
}
</style>
