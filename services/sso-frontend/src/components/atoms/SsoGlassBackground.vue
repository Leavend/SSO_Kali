<script setup lang="ts">
/**
 * SsoGlassBackground — atom: ambient background blob untuk auth pages.
 *
 * Restrained ambient (design.md §6.1):
 *  - opacity ≤4% (var --glass-ambient-opacity)
 *  - duration ≥30s (lambat = tidak distractif)
 *  - prefers-reduced-motion: reduce → benar-benar berhenti (pakai global override)
 *
 * Bukan dekorasi flashy. Tujuan: memberikan "tempat" subtle agar glass card
 * terasa duduk di permukaan, bukan melayang di void putih.
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
  blob1: string
  blob2: string
  blob3: string
}

const PRESETS: Record<Preset, BlobConfig> = {
  auth: {
    blob1: 'var(--color-brand-100)',
    blob2: 'var(--color-neutral-100)',
    blob3: 'var(--color-brand-50)',
  },
  consent: {
    blob1: 'var(--color-info-50)',
    blob2: 'var(--color-brand-100)',
    blob3: 'var(--color-neutral-100)',
  },
  error: {
    blob1: 'var(--color-error-50)',
    blob2: 'var(--color-neutral-100)',
    blob3: 'var(--color-warning-50)',
  },
  mfa: {
    blob1: 'var(--color-success-50)',
    blob2: 'var(--color-brand-50)',
    blob3: 'var(--color-neutral-100)',
  },
}

const config = computed<BlobConfig>(() => PRESETS[props.preset])
</script>

<template>
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
    <div
      class="sso-glass-blob sso-glass-blob--1 absolute -top-32 -left-32 size-96 rounded-full"
      :style="{
        background: `radial-gradient(circle, ${config.blob1} 0%, transparent 70%)`,
      }"
    />
    <div
      class="sso-glass-blob sso-glass-blob--2 absolute -right-24 -bottom-24 size-80 rounded-full"
      :style="{
        background: `radial-gradient(circle, ${config.blob2} 0%, transparent 70%)`,
      }"
    />
    <div
      class="sso-glass-blob sso-glass-blob--3 absolute top-1/2 left-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full"
      :style="{
        background: `radial-gradient(circle, ${config.blob3} 0%, transparent 70%)`,
      }"
    />
  </div>
</template>

<style scoped>
.sso-glass-blob {
  opacity: var(--glass-ambient-opacity, 0.04);
  filter: blur(48px);
}

.sso-glass-blob--3 {
  opacity: calc(var(--glass-ambient-opacity, 0.04) * 0.5);
  filter: blur(40px);
}

@media (prefers-reduced-motion: no-preference) {
  .sso-glass-blob--1 {
    animation: sso-glass-float-a var(--glass-ambient-duration, 30s) ease-in-out infinite;
  }
  .sso-glass-blob--2 {
    animation: sso-glass-float-b 38s ease-in-out infinite;
  }
  .sso-glass-blob--3 {
    animation: sso-glass-float-c 45s ease-in-out infinite;
  }
}

@keyframes sso-glass-float-a {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(-12px, 8px) scale(1.02);
  }
  66% {
    transform: translate(8px, -6px) scale(0.98);
  }
}

@keyframes sso-glass-float-b {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(10px, 12px) scale(1.03);
  }
}

@keyframes sso-glass-float-c {
  0%,
  100% {
    transform: translate(-50%, -50%);
  }
  40% {
    transform: translate(calc(-50% - 8px), calc(-50% - 10px));
  }
  70% {
    transform: translate(calc(-50% + 6px), calc(-50% + 4px));
  }
}
</style>
