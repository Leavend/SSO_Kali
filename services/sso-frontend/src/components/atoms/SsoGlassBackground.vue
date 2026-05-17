<script setup lang="ts">
/**
 * SsoGlassBackground — atom: vibrant Liquid Glass blobs untuk auth pages.
 *
 * EVOLUSI v3 (Liquid Glass × Alive edition):
 *   v1: 4% ambient — terlalu dingin.
 *   v2: vibrant blobs visible, idle float — lebih hidup tapi masih kaku.
 *   v3: + pointer parallax sangat subtle (max 12px translate) supaya blob
 *       "merespon" hadirnya pengguna. Gated penuh oleh prefers-reduced-motion
 *       — listener tidak pernah di-attach kalau user prefer reduced.
 *
 * Kontrak preserved:
 *   - aria-hidden="true" (decorative only — design.md §10.1)
 *   - 3 layer blob (test contract: SsoGlassBackground.spec.ts L24)
 *   - blob1 = stop brand-100 / error-50 (test contract L33-43)
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Preset = 'auth' | 'consent' | 'error' | 'mfa'

const props = withDefaults(
  defineProps<{
    preset?: Preset
  }>(),
  { preset: 'auth' },
)

interface BlobConfig {
  /** Stop awal blob1 — ditest oleh SsoGlassBackground.spec.ts. */
  blob1Stop: string
  /** Aksen vibrant blob1 (stop tengah). */
  blob1Accent: string
  blob2: string
  blob3: string
}

const PRESETS: Record<Preset, BlobConfig> = {
  auth: {
    blob1Stop: 'var(--color-brand-100)',
    blob1Accent: 'var(--color-blob-azure)',
    blob2: 'var(--color-blob-violet)',
    blob3: 'var(--color-blob-rose)',
  },
  consent: {
    blob1Stop: 'var(--color-info-50)',
    blob1Accent: 'var(--color-blob-azure)',
    blob2: 'var(--color-blob-mint)',
    blob3: 'var(--color-blob-violet)',
  },
  error: {
    blob1Stop: 'var(--color-error-50)',
    blob1Accent: 'var(--color-blob-rose)',
    blob2: 'var(--color-blob-amber)',
    blob3: 'var(--color-blob-violet)',
  },
  mfa: {
    blob1Stop: 'var(--color-success-50)',
    blob1Accent: 'var(--color-blob-mint)',
    blob2: 'var(--color-blob-azure)',
    blob3: 'var(--color-blob-violet)',
  },
}

const config = computed<BlobConfig>(() => PRESETS[props.preset])

/** Pointer parallax — attached only when user has not opted into reduced motion. */
const rootEl = ref<HTMLDivElement | null>(null)
let rafId = 0
let pointerHandler: ((e: PointerEvent) => void) | null = null

function setVars(x: number, y: number): void {
  if (!rootEl.value) return
  // Range -1..1, scaled to small px translate per layer.
  rootEl.value.style.setProperty('--sso-glass-pointer-x', String(x))
  rootEl.value.style.setProperty('--sso-glass-pointer-y', String(y))
}

onMounted(() => {
  if (typeof window === 'undefined') return
  if (typeof window.matchMedia !== 'function') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  pointerHandler = (event: PointerEvent): void => {
    if (rafId !== 0) return
    rafId = window.requestAnimationFrame(() => {
      rafId = 0
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      const x = (event.clientX / w) * 2 - 1
      const y = (event.clientY / h) * 2 - 1
      setVars(x, y)
    })
  }
  window.addEventListener('pointermove', pointerHandler, { passive: true })
})

onBeforeUnmount(() => {
  if (pointerHandler) {
    window.removeEventListener('pointermove', pointerHandler)
    pointerHandler = null
  }
  if (rafId !== 0) {
    window.cancelAnimationFrame(rafId)
    rafId = 0
  }
})
</script>

<template>
  <div
    ref="rootEl"
    aria-hidden="true"
    class="sso-glass-bg pointer-events-none absolute inset-0 overflow-hidden"
  >
    <!-- blob1: brand-keyed (test contract) — diperkuat dengan stop accent vibrant -->
    <div
      class="sso-glass-blob sso-glass-blob--1 absolute -top-40 -left-32 size-[36rem] rounded-full"
      :style="{
        background: `radial-gradient(circle, ${config.blob1Stop} 0%, ${config.blob1Accent} 35%, transparent 75%)`,
      }"
    />
    <!-- blob2: vibrant violet/mint/amber, larger and offset -->
    <div
      class="sso-glass-blob sso-glass-blob--2 absolute -right-32 -bottom-40 size-[40rem] rounded-full"
      :style="{
        background: `radial-gradient(circle, ${config.blob2} 0%, transparent 70%)`,
      }"
    />
    <!-- blob3: pure vibrant accent, mid screen -->
    <div
      class="sso-glass-blob sso-glass-blob--3 absolute top-1/3 left-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
      :style="{
        background: `radial-gradient(circle, ${config.blob3} 0%, transparent 70%)`,
      }"
    />
  </div>
</template>

<style scoped>
.sso-glass-bg {
  --sso-glass-pointer-x: 0;
  --sso-glass-pointer-y: 0;
}

.sso-glass-blob {
  /* Visible coloured blob — see main.css for token defaults. */
  opacity: var(--glass-blob-opacity, 0.55);
  filter: blur(var(--glass-blob-blur, 80px));
  will-change: transform;
  transition: transform 600ms var(--ease-smooth);
}

.sso-glass-blob--3 {
  /* Center blob lebih halus agar tidak overpower readability. */
  opacity: calc(var(--glass-blob-opacity, 0.55) * 0.65);
  filter: blur(calc(var(--glass-blob-blur, 80px) * 0.85));
}

@media (prefers-reduced-motion: no-preference) {
  .sso-glass-blob--1 {
    animation: sso-glass-float-a var(--glass-blob-duration, 28s) ease-in-out infinite;
  }
  .sso-glass-blob--2 {
    animation: sso-glass-float-b 34s ease-in-out infinite;
  }
  .sso-glass-blob--3 {
    animation: sso-glass-float-c 42s ease-in-out infinite;
  }
  /* Pointer parallax — each blob translates with a different intensity to suggest depth. */
  .sso-glass-blob--1 {
    translate: calc(var(--sso-glass-pointer-x) * 16px) calc(var(--sso-glass-pointer-y) * 12px);
  }
  .sso-glass-blob--2 {
    translate: calc(var(--sso-glass-pointer-x) * -22px) calc(var(--sso-glass-pointer-y) * -16px);
  }
  .sso-glass-blob--3 {
    translate: calc(var(--sso-glass-pointer-x) * 8px) calc(var(--sso-glass-pointer-y) * -10px);
  }
}

@keyframes sso-glass-float-a {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(-24px, 18px) scale(1.04);
  }
  66% {
    transform: translate(18px, -14px) scale(0.96);
  }
}

@keyframes sso-glass-float-b {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(22px, 26px) scale(1.05);
  }
}

@keyframes sso-glass-float-c {
  0%,
  100% {
    transform: translate(-50%, -50%);
  }
  40% {
    transform: translate(calc(-50% - 18px), calc(-50% - 22px));
  }
  70% {
    transform: translate(calc(-50% + 14px), calc(-50% + 8px));
  }
}
</style>
