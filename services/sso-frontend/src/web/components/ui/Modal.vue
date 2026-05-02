<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { X } from 'lucide-vue-next'

defineOptions({
  name: 'AdminModal',
})

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}>(), {
  size: 'md',
  closable: true,
  closeOnBackdrop: true,
  closeOnEscape: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const modalRef = ref<HTMLElement | null>(null)
const isVisible = ref(false)
const isAnimating = ref(false)
let previousActiveElement: HTMLElement | null = null
let animationTimer: number | undefined

function close() {
  emit('update:modelValue', false)
}

function handleBackdropClick(event: MouseEvent) {
  if (props.closeOnBackdrop && event.target === event.currentTarget) {
    close()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (props.closeOnEscape && event.key === 'Escape') {
    event.preventDefault()
    close()
  }

  // Focus trap
  if (event.key === 'Tab' && modalRef.value) {
    const focusable = modalRef.value.querySelectorAll<HTMLElement>(
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
  if (animationTimer !== undefined) {
    window.clearTimeout(animationTimer)
    animationTimer = undefined
  }

  if (isOpen) {
    previousActiveElement = document.activeElement as HTMLElement
    isAnimating.value = true
    document.body.style.overflow = 'hidden'
    await nextTick()
    isVisible.value = true

    // Focus first focusable element
    const firstFocusable = modalRef.value?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    firstFocusable?.focus()
  } else {
    isVisible.value = false
    document.body.style.overflow = ''
    previousActiveElement?.focus()
    animationTimer = window.setTimeout(() => {
      isAnimating.value = false
    }, 200)
  }
}, { immediate: true })

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
  if (animationTimer !== undefined) {
    window.clearTimeout(animationTimer)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue && isAnimating"
        class="modal-backdrop"
        aria-hidden="true"
        @click="handleBackdropClick"
      >
        <div
          ref="modalRef"
          class="modal"
          :class="[`modal--${size}`, { 'modal--visible': isVisible }]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? 'modal-title' : undefined"
        >
          <header v-if="title || closable" class="modal__header">
            <h2 v-if="title" id="modal-title" class="modal__title">{{ title }}</h2>
            <button
              v-if="closable"
              type="button"
              class="modal__close"
              aria-label="Close modal"
              @click="close"
            >
              <X :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="modal__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(0 0 0 / 60%);
  backdrop-filter: blur(4px);
}

.modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: calc(100vh - var(--space-8));
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-xl);
  box-shadow: 0 25px 50px var(--admin-shadow-lg);
  opacity: 0;
  transform: scale(0.95) translateY(10px);
  transition:
    opacity 0.2s var(--ease-out),
    transform 0.2s var(--ease-out);
}

.modal--visible {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.modal--sm { max-width: 400px; }
.modal--md { max-width: 500px; }
.modal--lg { max-width: 700px; }
.modal--xl { max-width: 900px; }

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--admin-line);
  flex-shrink: 0;
}

.modal__title {
  margin: 0;
  color: var(--admin-ink);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: 0;
}

.modal__close {
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

.modal__close:hover {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
}

.modal__body {
  flex: 1;
  min-height: 0;
  padding: var(--space-6);
  overflow-y: auto;
}

.modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--admin-line);
  flex-shrink: 0;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s var(--ease-out);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .modal-backdrop {
    padding: 0;
    align-items: flex-end;
  }

  .modal {
    max-width: 100%;
    max-height: 90vh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }

  .modal--visible {
    transform: translateY(0);
  }

  .modal-enter-from .modal,
  .modal-leave-to .modal {
    transform: translateY(100%);
  }
}
</style>
