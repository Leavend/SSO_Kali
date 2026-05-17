<script setup lang="ts">
/**
 * SsoGlassBackground — atom: vibrant Liquid Glass blobs untuk auth pages.
 *
 * EVOLUSI v2 (Liquid Glass × Vibrant edition):
 *   Versi pertama 4% ambient terlalu dingin — jauh dari acuan EaseMize.
 *   Versi ini render colored blobs yang VISIBLE (opacity ≥0.45) sebagai
 *   "tempat" tempat glass card berdiri, mempertahankan:
 *     - aria-hidden="true" (decorative only — design.md §10.1)
 *     - prefers-reduced-motion: reduce → animasi berhenti (WCAG 2.3.3)
 *     - 3 layer blob (test contract: SsoGlassBackground.spec.ts L24)
 *     - blob1 = stop brand-100 / error-50 (test contract L33-43)
 *
 * Glass card di atasnya WAJIB punya backdrop-filter: blur(...) yang sudah
 * disediakan oleh SsoGlassSurface — itulah yang membuat blob "diserap"
 * lewat kaca.
 */

import { computed } from 'vue'

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
</script>

<template>
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
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
.sso-glass-blob {
  /* Visible coloured blob — see main.css for token defaults. */
  opacity: var(--glass-blob-opacity, 0.55);
  filter: blur(var(--glass-blob-blur, 80px));
  will-change: transform;
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
