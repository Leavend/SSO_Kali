<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  size?: 'md' | 'lg'
}>(), {
  size: 'md',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const panelRef = ref<HTMLElement | null>(null)
const isVisible = ref(false)
let previousActiveElement: HTMLElement | null = null

function close() {
  emit('update:modelValue', false)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
  }

  // Focus trap
  if (event.key === 'Tab' && panelRef.value) {
    const focusable = panelRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
}

watch(() => props.modelValue, async (isOpen) => {
  if (isOpen) {
    previousActiveElement = document.activeElement as HTMLElement
    document.body.style.overflow = 'hidden'
    await nextTick()
    isVisible.value = true
    panelRef.value?.focus()
  } else {
    isVisible.value = false
    document.body.style.overflow = ''
    previousActiveElement?.focus()
  }
}, { immediate: true })

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-over">
      <div
        v-if="modelValue"
        class="slide-over-backdrop"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <Transition name="slide-over-panel">
      <div
        v-if="modelValue"
        ref="panelRef"
        class="slide-over"
        :class="[`slide-over--${size}`]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? 'slide-over-title' : undefined"
        tabindex="-1"
      >
        <header class="slide-over__header">
          <h2 v-if="title" id="slide-over-title" class="slide-over__title">{{ title }}</h2>
          <button
            type="button"
            class="slide-over__close"
            aria-label="Close panel"
            @click="close"
          >
            <X :size="20" aria-hidden="true" />
          </button>
        </header>
        <div class="slide-over__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="slide-over__footer">
          <slot name="footer" />
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-over-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgb(0 0 0 / 50%);
  backdrop-filter: blur(2px);
}

.slide-over {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 95;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  background: var(--admin-panel);
  border-left: 1px solid var(--admin-line);
  box-shadow: -20px 0 50px var(--admin-shadow-lg);
  outline: none;
}

.slide-over--md { max-width: 480px; }
.slide-over--lg { max-width: 640px; }

.slide-over__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--admin-line);
  flex-shrink: 0;
}

.slide-over__title {
  margin: 0;
  color: var(--admin-ink);
  font-size: var(--text-lg);
  font-weight: 700;
}

.slide-over__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: var(--admin-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color var(--duration-fast) ease, color var(--duration-fast) ease;
  flex-shrink: 0;
}

.slide-over__close:hover {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
}

.slide-over__body {
  flex: 1;
  min-height: 0;
  padding: var(--space-6);
  overflow-y: auto;
}

.slide-over__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--admin-line);
  flex-shrink: 0;
}

/* Transitions */
.slide-over-enter-active,
.slide-over-leave-active {
  transition: opacity 0.2s var(--ease-out);
}

.slide-over-enter-from,
.slide-over-leave-to {
  opacity: 0;
}

.slide-over-panel-enter-active,
.slide-over-panel-leave-active {
  transition: transform 0.25s var(--ease-out);
}

.slide-over-panel-enter-from,
.slide-over-panel-leave-to {
  transform: translateX(100%);
}

@media (max-width: 640px) {
  .slide-over {
    max-width: 100%;
    border-left: none;
  }
}
</style>
