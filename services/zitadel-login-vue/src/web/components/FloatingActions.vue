<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'

const lift = ref(0)
const style = computed(() => ({ '--floating-actions-lift': `${lift.value}px` }))
let frame = 0
let resizeObserver: ResizeObserver | undefined

function schedulePositionUpdate(): void {
  if (frame) return
  frame = window.requestAnimationFrame(() => {
    frame = 0
    updatePosition()
  })
}

function updatePosition(): void {
  const actions = document.querySelector<HTMLElement>('.floating-actions')
  if (!actions) return

  const footer = document.querySelector<HTMLElement>('.auth-footer')
  const submit = document.querySelector<HTMLElement>('.signin-submit')
  const blockers = [footer, submit].filter((element): element is HTMLElement => Boolean(element))

  if (blockers.length === 0) {
    lift.value = 0
    return
  }

  const actionsRect = actions.getBoundingClientRect()

  const requiredLift = blockers.reduce((offset, blocker) => {
    const blockerRect = blocker.getBoundingClientRect()
    const horizontallyOverlaps =
      actionsRect.left < blockerRect.right && actionsRect.right > blockerRect.left
    const verticalOverlap = actionsRect.bottom - blockerRect.top + 12

    return horizontallyOverlaps && verticalOverlap > offset ? verticalOverlap : offset
  }, 0)

  lift.value = Math.min(Math.max(requiredLift, 0), 128)
}

onMounted(() => {
  window.addEventListener('scroll', schedulePositionUpdate, { passive: true })
  window.addEventListener('resize', schedulePositionUpdate)

  // Observe layout changes to footer/submit that may trigger overlap
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      schedulePositionUpdate()
    })

    const footer = document.querySelector<HTMLElement>('.auth-footer')
    const submit = document.querySelector<HTMLElement>('.signin-submit')
    if (footer) resizeObserver.observe(footer)
    if (submit) resizeObserver.observe(submit)
  }

  schedulePositionUpdate()
})

onUnmounted(() => {
  window.removeEventListener('scroll', schedulePositionUpdate)
  window.removeEventListener('resize', schedulePositionUpdate)
  if (frame) window.cancelAnimationFrame(frame)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div
    class="floating-actions"
    :style="style"
    aria-label="Page actions"
  >
    <div
      id="devsso-theme-float"
      class="theme-toggle-anchor"
    >
      <ThemeToggle />
    </div>

    <ScrollToTop />
  </div>
</template>
