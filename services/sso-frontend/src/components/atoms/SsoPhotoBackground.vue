<script setup lang="ts">
/**
 * SsoPhotoBackground — atom: full-bleed photographic backdrop for the
 * Aurora auth shell. Replaces the procedural SVG when the layout
 * variant is `photo`, while preserving the same z-stacking and
 * accessibility contract.
 *
 * Visual contract:
 *   - Photo paints edge-to-edge, `object-fit: cover`, focal point biased
 *     to the building (centre-top) so the headline column on the left and
 *     pill column in the middle have darker negative space behind them.
 *   - A two-stop overlay (top vignette + bottom navy wash) gives the form
 *     pills enough contrast to keep WCAG AA readability against bright
 *     daytime skies in the source photo.
 *   - `preset` tints the overlay so consent / mfa / error pages still
 *     read as a different state without swapping the underlying photo.
 *   - Decorative-only, `aria-hidden="true"`. The page heading carries the
 *     semantic context.
 *
 * Theme-reactive (dramatic, not subtle):
 *   - Light mode → "Civic Poster, late-morning". Sky vivid, building
 *     sharp, brightness lifted, almost-zero blur. Photo is the hero.
 *   - Dark mode → "Night-Glass". Brightness halved, saturation drained,
 *     hue pulled toward cool navy via heavy tint, blur ~4px. Photo
 *     deliberately recedes to a calm supporting layer behind the pill.
 *   - The override block is intentionally placed in an UNSCOPED <style>
 *     so it survives Vue's scoped attribute rewriting regardless of
 *     compiler version. The base (light) styles stay scoped.
 *
 * Motion:
 *   - Slow Ken Burns drift (~32s) on the photo layer for "alive" feel.
 *   - Disabled under `prefers-reduced-motion: reduce`.
 *
 * Performance:
 *   - WebP source already 1600×900 (~295 KB). Vite fingerprints + caches.
 *   - `loading="eager"` + `fetchpriority="high"`: this is the LCP element.
 *   - `decoding="async"` so the rest of the bundle keeps painting.
 */

import authBgBontang from '@/assets/images/auth-bg-bontang.webp'

type PhotoPreset = 'default' | 'cool' | 'error'

const props = withDefaults(
  defineProps<{
    preset?: PhotoPreset
    /** Optional alt text override; default keeps the layer decorative. */
    alt?: string
  }>(),
  { preset: 'default', alt: '' },
)
</script>

<template>
  <div
    aria-hidden="true"
    :data-preset="props.preset"
    class="sso-photo-bg pointer-events-none absolute inset-0 overflow-hidden"
  >
    <img
      :src="authBgBontang"
      :alt="props.alt"
      class="sso-photo-bg__img absolute inset-0 size-full object-cover"
      width="1600"
      height="900"
      loading="eager"
      fetchpriority="high"
      decoding="async"
    />

    <!--
      Two-layer overlay. Theme-reactive via CSS variables.
        1. tinted vertical gradient for headline + form contrast
        2. radial spotlight that darkens corners and lifts the centre column
    -->
    <div class="sso-photo-bg__tint absolute inset-0" />
    <div class="sso-photo-bg__spotlight absolute inset-0" />
  </div>
</template>

<style scoped>
/*
 * BASE = LIGHT MODE — "Civic Poster, late-morning".
 *   - Top tint near transparent so the Bontang sky stays vivid.
 *   - Brightness/saturation lifted, near-zero blur — building reads sharp.
 *   - Bottom vignette stays strong to anchor the form pill column.
 */
.sso-photo-bg {
  --photo-tint-top: oklch(0.62 0.03 235 / 0.04);
  --photo-tint-mid: oklch(0.40 0.03 250 / 0.16);
  --photo-tint-bottom: oklch(0.18 0.04 265 / 0.46);
  --photo-spot-mid: oklch(0.10 0.03 265 / 0.04);
  --photo-spot-edge: oklch(0.10 0.03 265 / 0.30);
  --photo-vignette-strength: oklch(0.10 0.03 265 / 0.32);
  --photo-img-brightness: 1.12;
  --photo-img-saturation: 1.20;
  --photo-img-contrast: 1.06;
  --photo-img-blur: 0.4px;
  --photo-img-hue: 0deg;

  background: oklch(0.05 0.012 270);
}

/* Preset \u2014 cool: lift the hue toward azure (light-mode base). */
.sso-photo-bg[data-preset='cool'] {
  --photo-tint-top: oklch(0.62 0.04 240 / 0.06);
  --photo-tint-mid: oklch(0.40 0.05 245 / 0.20);
  --photo-tint-bottom: oklch(0.18 0.06 250 / 0.52);
}

/* Preset \u2014 error: warm crimson lift, used by 404 / breakage pages. */
.sso-photo-bg[data-preset='error'] {
  --photo-tint-top: oklch(0.60 0.05 24 / 0.10);
  --photo-tint-mid: oklch(0.40 0.06 24 / 0.22);
  --photo-tint-bottom: oklch(0.18 0.06 22 / 0.55);
}

.sso-photo-bg__img {
  /*
   * Theme-driven filter stack. Light mode lifts brightness/saturation
   * with near-zero blur (photo "pops"); dark mode drops brightness,
   * desaturates, hue-rotates toward cool navy, and quintuples the blur
   * (photo "recedes"). The transition makes the toggle feel cinematic
   * instead of binary.
   */
  filter: blur(var(--photo-img-blur)) saturate(var(--photo-img-saturation))
    brightness(var(--photo-img-brightness)) contrast(var(--photo-img-contrast, 1))
    hue-rotate(var(--photo-img-hue, 0deg));
  transform-origin: center center;
  transition:
    filter 520ms var(--ease-smooth);
}

.sso-photo-bg__tint {
  background: linear-gradient(
    180deg,
    var(--photo-tint-top) 0%,
    var(--photo-tint-mid) 48%,
    var(--photo-tint-bottom) 100%
  );
  transition: background 520ms var(--ease-smooth);
}

.sso-photo-bg__spotlight {
  background:
    radial-gradient(
      ellipse 28% 65% at 50% 52%,
      var(--photo-vignette-strength) 0%,
      transparent 80%
    ),
    radial-gradient(
      ellipse 80% 60% at 50% 55%,
      transparent 0%,
      var(--photo-spot-mid) 60%,
      var(--photo-spot-edge) 100%
    );
  mix-blend-mode: multiply;
  transition: background 520ms var(--ease-smooth);
}

@media (prefers-reduced-motion: no-preference) {
  .sso-photo-bg__img {
    animation: sso-photo-kenburns 32s ease-in-out infinite;
  }
}

@keyframes sso-photo-kenburns {
  0%,
  100% {
    transform: scale(1.04) translate(0, 0);
  }
  50% {
    transform: scale(1.08) translate(-1.2%, -0.8%);
  }
}
</style>

<!--
  UNSCOPED override block.
  Why unscoped: in Vue \u2018s <style scoped>, the selector
  `:global(.dark) .sso-photo-bg` compiles to `.dark .sso-photo-bg[data-v-XXX]`,
  but historical compiler quirks can cause that to drop the `.dark` ancestor
  match in some build configurations \u2014 producing exactly the symptom user
  reported (toggling theme has no visible effect on the photo). Splitting the
  dark overrides into a plain unscoped block sidesteps the issue: scoped
  CSS still adds [data-v-XXX] to the element but it ALSO retains the raw
  `.sso-photo-bg` class, so a plain `.dark .sso-photo-bg` selector matches.
-->
<style>
.dark .sso-photo-bg {
  /*
   * DARK = "Night-Glass" (deliberately dramatic).
   *   - Top tint dives into deep navy: sky compresses into ambient haze.
   *   - Mid + bottom dial up alpha so building silhouette becomes a quiet
   *     supporting layer rather than the focal point.
   *   - Brightness drops to ~half, saturation drained, hue pulled cooler
   *     via tint and a small hue-rotate, blur quintupled \u2014 photo
   *     deliberately hangs back so the pill becomes the obvious centre.
   */
  --photo-tint-top: oklch(0.18 0.035 260 / 0.36);
  --photo-tint-mid: oklch(0.14 0.04 265 / 0.42);
  --photo-tint-bottom: oklch(0.08 0.035 270 / 0.68);
  --photo-spot-mid: oklch(0.07 0.018 270 / 0.16);
  --photo-spot-edge: oklch(0.05 0.016 270 / 0.36);
  --photo-vignette-strength: oklch(0.06 0.016 270 / 0.24);
  --photo-img-brightness: 0.78;
  --photo-img-saturation: 0.86;
  --photo-img-contrast: 0.98;
  --photo-img-blur: 1.6px;
  --photo-img-hue: -5deg;
}

.dark .sso-photo-bg[data-preset='cool'] {
  --photo-tint-top: oklch(0.20 0.05 250 / 0.38);
  --photo-tint-mid: oklch(0.16 0.06 250 / 0.44);
  --photo-tint-bottom: oklch(0.08 0.05 250 / 0.70);
}

.dark .sso-photo-bg[data-preset='error'] {
  --photo-tint-top: oklch(0.18 0.05 22 / 0.36);
  --photo-tint-mid: oklch(0.15 0.06 22 / 0.42);
  --photo-tint-bottom: oklch(0.08 0.06 22 / 0.68);
}
</style>
