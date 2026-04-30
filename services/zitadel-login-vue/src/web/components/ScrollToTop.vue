<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ArrowUp } from 'lucide-vue-next'

const SCROLL_THRESHOLD = 200

const visible = ref(false)

function checkPosition(): void {
  visible.value = window.scrollY > SCROLL_THRESHOLD
}

function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

let onScroll: (() => void) | undefined

onMounted(() => {
  onScroll = checkPosition
  window.addEventListener('scroll', onScroll, { passive: true })
  checkPosition()
})

onUnmounted(() => {
  if (onScroll) {
    window.removeEventListener('scroll', onScroll)
  }
})
</script>

<template>
  <Transition name="scroll-top-fade">
    <button
      v-show="visible"
      class="scroll-to-top"
      type="button"
      aria-label="Back to top"
      @click="scrollToTop"
    >
      <ArrowUp :size="20" aria-hidden="true" />
    </button>
  </Transition>
</template>

<style scoped>
.scroll-to-top {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid color-mix(in srgb, var(--line) 50%, transparent);
  border-radius: 12px;
  color: var(--accent-contrast, #ffffff);
  background: var(--accent, #2563eb);
  cursor: pointer;
  box-shadow: 0 4px 16px var(--shadow);
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease,
    box-shadow 0.16s ease;
}

.scroll-to-top:hover {
  background: var(--accent-hover, #1d4ed8);
  transform: translateY(-2px);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--accent, #2563eb) 36%, transparent);
}

.scroll-to-top:focus-visible {
  outline: 2px solid var(--focus-ring, #1d4ed8);
  outline-offset: 3px;
}

.scroll-top-fade-enter-active,
.scroll-top-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.scroll-top-fade-enter-from,
.scroll-top-fade-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.9);
}
</style>
