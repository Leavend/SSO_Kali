<script setup lang="ts">
/**
 * SsoAuroraSvg — atom: SVG-based aurora background, easemize-faithful.
 *
 * Earlier iteration pinned stops to shadcn theme tokens (`var(--color-chart-*)`,
 * `var(--color-primary)`, `var(--color-secondary)`, `var(--color-destructive)`,
 * `var(--color-accent)`). That made the aurora retune with light/dark mode,
 * but the resulting palette was muted because shadcn tokens are calibrated
 * for chart and chrome UI, not for showpiece full-bleed gradients.
 *
 * Current contract: explicit OKLCH stops, deeply saturated, near the same
 * hues the easemize reference ships (warm gold, cool indigo, crimson). Per
 * preset we swap a small named palette so consent / mfa / error pages still
 * read different without going dim. Decorative only — `aria-hidden="true"`.
 *
 * Idle drift is slow (≥22s) and gated by `prefers-reduced-motion: reduce`.
 */

import { computed } from 'vue'

type AuroraPreset = 'default' | 'cool' | 'error'

const props = withDefaults(
  defineProps<{
    preset?: AuroraPreset
  }>(),
  { preset: 'default' },
)

interface AuroraPalette {
  /** Linear gradient — large blurred ellipse on the left. */
  warm: { from: string; to: string }
  /** Linear gradient — rounded rect on the upper right. */
  cool: { from: string; mid: string; to: string }
  /** Radial flare — mid-right glow. */
  accent: { from: string; to: string }
  /** Solid amber-ish fill on the small ellipse top-left. */
  highlight: string
}

const PRESETS: Record<AuroraPreset, AuroraPalette> = {
  default: {
    warm: { from: 'oklch(0.78 0.20 75)', to: 'oklch(0.62 0.20 50)' },
    cool: { from: 'oklch(0.50 0.22 290)', mid: 'oklch(0.58 0.22 305)', to: 'oklch(0.55 0.20 320)' },
    accent: { from: 'oklch(0.58 0.26 22)', to: 'oklch(0.45 0.20 340)' },
    highlight: 'oklch(0.78 0.18 65)',
  },
  cool: {
    warm: { from: 'oklch(0.62 0.20 240)', to: 'oklch(0.50 0.22 270)' },
    cool: { from: 'oklch(0.55 0.22 290)', mid: 'oklch(0.62 0.24 320)', to: 'oklch(0.66 0.22 340)' },
    accent: { from: 'oklch(0.62 0.24 340)', to: 'oklch(0.50 0.22 270)' },
    highlight: 'oklch(0.66 0.20 240)',
  },
  error: {
    warm: { from: 'oklch(0.62 0.26 22)', to: 'oklch(0.50 0.22 18)' },
    cool: { from: 'oklch(0.50 0.22 285)', mid: 'oklch(0.55 0.20 320)', to: 'oklch(0.58 0.22 340)' },
    accent: { from: 'oklch(0.78 0.20 75)', to: 'oklch(0.62 0.20 50)' },
    highlight: 'oklch(0.78 0.18 65)',
  },
}

const palette = computed<AuroraPalette>(() => PRESETS[props.preset])
</script>

<template>
  <div
    aria-hidden="true"
    class="sso-aurora-svg pointer-events-none absolute inset-0 overflow-hidden"
  >
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      class="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id="sso-aurora-grad-warm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" :stop-color="palette.warm.from" stop-opacity="0.95" />
          <stop offset="100%" :stop-color="palette.warm.to" stop-opacity="0.7" />
        </linearGradient>
        <linearGradient id="sso-aurora-grad-cool" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" :stop-color="palette.cool.from" stop-opacity="0.95" />
          <stop offset="50%" :stop-color="palette.cool.mid" stop-opacity="0.85" />
          <stop offset="100%" :stop-color="palette.cool.to" stop-opacity="0.8" />
        </linearGradient>
        <radialGradient id="sso-aurora-grad-accent" cx="50%" cy="50%" r="50%">
          <stop offset="0%" :stop-color="palette.accent.from" stop-opacity="0.9" />
          <stop offset="100%" :stop-color="palette.accent.to" stop-opacity="0.55" />
        </radialGradient>

        <filter id="sso-aurora-blur-heavy" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="42" />
        </filter>
        <filter id="sso-aurora-blur-medium" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="32" />
        </filter>
        <filter id="sso-aurora-blur-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="52" />
        </filter>
      </defs>

      <g class="sso-aurora-cluster sso-aurora-cluster--a">
        <ellipse
          cx="200"
          cy="500"
          rx="280"
          ry="200"
          fill="url(#sso-aurora-grad-warm)"
          filter="url(#sso-aurora-blur-heavy)"
          transform="rotate(-30 200 500)"
        />
        <rect
          x="500"
          y="100"
          width="340"
          height="280"
          rx="80"
          fill="url(#sso-aurora-grad-cool)"
          filter="url(#sso-aurora-blur-medium)"
          transform="rotate(15 670 240)"
        />
      </g>

      <g class="sso-aurora-cluster sso-aurora-cluster--b">
        <circle
          cx="650"
          cy="450"
          r="170"
          fill="url(#sso-aurora-grad-accent)"
          filter="url(#sso-aurora-blur-soft)"
          opacity="0.85"
        />
        <ellipse
          cx="60"
          cy="160"
          rx="200"
          ry="140"
          :fill="palette.highlight"
          filter="url(#sso-aurora-blur-medium)"
          opacity="0.85"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.sso-aurora-svg {
  /* Near-black canvas independent of shadcn theme so the saturated stops
     above always read as colour, not as wash. Light-mode users still get
     the dark dramatic shell on auth screens (matches reference). */
  background: oklch(0.05 0.012 270);
}

@media (prefers-reduced-motion: no-preference) {
  .sso-aurora-cluster--a {
    animation: sso-aurora-drift-a 22s ease-in-out infinite;
    transform-origin: center;
  }
  .sso-aurora-cluster--b {
    animation: sso-aurora-drift-b 28s ease-in-out infinite;
    transform-origin: center;
  }
}

@keyframes sso-aurora-drift-a {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-14px, 14px);
  }
}

@keyframes sso-aurora-drift-b {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(14px, -14px);
  }
}
</style>
