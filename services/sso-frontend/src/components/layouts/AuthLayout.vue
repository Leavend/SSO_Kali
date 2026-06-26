<script setup lang="ts">
/**
 * AuthLayout — Aurora redesign (easemize-faithful, theme-aware).
 *
 * Visual contract:
 *   - Top-fixed brand lockup (icon + brand name) at top center / md:top-left
 *   - Single SVG aurora canvas pinned behind everything via `bg-card` panel
 *   - RouterView occupies the centre; pages own their own serif headline
 *     because steps swap headlines per active state (login: 2 steps,
 *     register: 3 steps).
 *
 * Stacking contract:
 *   - `.aurora-shell` establishes a stacking context via `isolation: isolate`.
 *   - SVG paints at z-0; lockup at z-20; main at z-10.
 *
 * Frozen contracts:
 *   - skip-to-main link (#auth-main) for keyboard users (WCAG 2.4.1)
 *   - RouterView preserved (auth-shell-layout.test.ts)
 *   - shell stays portal-only; no governance routes referenced here
 */

import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import SsoAuroraSvg from '@/components/atoms/SsoAuroraSvg.vue'
import SsoAuthLockup from '@/components/atoms/SsoAuthLockup.vue'
import SsoPhotoBackground from '@/components/atoms/SsoPhotoBackground.vue'
import ThemeModeControl from '@/components/atoms/ThemeModeControl.vue'
import type { AuroraPreset, AuthBackgroundVariant } from '@/router'

const route = useRoute()
const auroraPreset = computed<AuroraPreset>(() => route.meta.hero?.aurora ?? 'default')
/**
 * Background variant for the Aurora shell.
 *   - `photo`  → SsoPhotoBackground (default; Balaikota Bontang civic photo)
 *   - `aurora` → SsoAuroraSvg (procedural fallback, retained for rollback)
 *
 * Pages opt out via `route.meta.hero.background = 'aurora'`. Without that
 * meta the photo wins, matching the design direction agreed with PMO.
 */
const backgroundVariant = computed<AuthBackgroundVariant>(
  () => route.meta.hero?.background ?? 'photo',
)
const mainWidthClass = computed<string>(() => {
  switch (route.meta.hero?.maxWidth) {
    case 'lg':
      return 'max-w-2xl'
    case 'xl':
      return 'max-w-4xl'
    default:
      return 'max-w-3xl'
  }
})
</script>

<template>
  <div class="aurora-shell relative isolate flex min-h-screen w-full flex-col bg-background">
    <a
      href="#auth-main"
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
    >
      Langsung ke konten utama
    </a>

    <div class="auth-top-scrim pointer-events-none fixed inset-x-0 top-0 z-[19] h-24" />

    <SsoAuthLockup
      class="fixed left-1/2 top-4 z-20 -translate-x-1/2 text-foreground md:left-6 md:translate-x-0"
    />

    <ThemeModeControl standalone class="fixed right-4 top-4 z-20" />

    <div
      class="relative isolate flex min-h-screen w-full flex-1 items-center justify-center overflow-hidden"
    >
      <SsoPhotoBackground
        v-if="backgroundVariant === 'photo'"
        :preset="auroraPreset"
        class="absolute inset-0"
      />
      <SsoAuroraSvg v-else :preset="auroraPreset" class="absolute inset-0" />

      <main
        id="auth-main"
        :class="[
          'auth-main relative z-10 isolate mx-auto flex w-full flex-col items-center gap-8 px-4 py-16 sm:py-20',
          mainWidthClass,
        ]"
      >
        <RouterView v-slot="{ Component }">
          <Transition name="aurora-flow" mode="out-in">
            <component :is="Component" class="w-full" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.aurora-flow-enter-active,
.aurora-flow-leave-active {
  transition:
    opacity 280ms var(--ease-smooth),
    transform 280ms var(--ease-smooth);
}
.aurora-flow-enter-from {
  opacity: 0;
  transform: translateY(0.5rem);
}
.aurora-flow-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}

.auth-top-scrim {
  background: linear-gradient(180deg, rgb(2 6 23 / 0.42), rgb(2 6 23 / 0));
}

.dark .auth-top-scrim {
  background: linear-gradient(180deg, rgb(2 6 23 / 0.3), rgb(2 6 23 / 0));
}

.auth-main::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: -1;
  width: min(48rem, calc(100vw - 2rem));
  height: min(30rem, calc(100vh - 8rem));
  border-radius: 9999px;
  pointer-events: none;
  transform: translate(-50%, -45%);
  background: radial-gradient(
    ellipse at 50% 48%,
    rgb(2 6 23 / 0.42) 0%,
    rgb(2 6 23 / 0.3) 42%,
    rgb(2 6 23 / 0.12) 72%,
    transparent 100%
  );
  filter: blur(22px);
  opacity: 1;
  transition:
    background 520ms var(--ease-smooth),
    opacity 520ms var(--ease-smooth),
    filter 520ms var(--ease-smooth);
}

.dark .auth-main::before {
  background: radial-gradient(
    ellipse at 50% 48%,
    rgb(2 6 23 / 0.24) 0%,
    rgb(2 6 23 / 0.16) 46%,
    rgb(2 6 23 / 0.06) 74%,
    transparent 100%
  );
  filter: blur(20px);
}

.auth-main :deep(header h1),
.auth-main :deep(header p),
.auth-main :deep(section > div:last-child),
.auth-main :deep(section > div:last-child a) {
  text-shadow:
    0 2px 18px rgb(0 0 0 / 0.48),
    0 1px 2px rgb(0 0 0 / 0.42);
}

.dark .auth-main :deep(header h1),
.dark .auth-main :deep(header p),
.dark .auth-main :deep(section > div:last-child),
.dark .auth-main :deep(section > div:last-child a) {
  text-shadow:
    0 2px 14px rgb(0 0 0 / 0.34),
    0 1px 2px rgb(0 0 0 / 0.3);
}

@media (prefers-reduced-motion: reduce) {
  .aurora-flow-enter-active,
  .aurora-flow-leave-active {
    transition: opacity 180ms var(--ease-smooth);
  }
  .aurora-flow-enter-from,
  .aurora-flow-leave-to {
    transform: none;
  }
  .auth-main::before {
    transition: none;
  }
}
</style>
