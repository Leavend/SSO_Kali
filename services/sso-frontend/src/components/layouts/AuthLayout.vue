<script setup lang="ts">
/**
 * AuthLayout — shell untuk halaman publik (login, error, consent, MFA).
 *
 * REDESIGN: Liquid Glass × Austere Precision
 * Changed: visual shell only — ambient background + spacing tightened.
 * Frozen:  router behaviour, route registration, ThemeToggleButton placement.
 */

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppBrandMark from '@/components/atoms/AppBrandMark.vue'
import SsoGlassBackground from '@/components/atoms/SsoGlassBackground.vue'
import ThemeToggleButton from '@/components/atoms/ThemeToggleButton.vue'
import { RouterView } from 'vue-router'

type GlassPreset = 'auth' | 'consent' | 'error' | 'mfa'

const route = useRoute()

/** Pilih ambient preset berdasarkan route. Sangat subtle (≤4% opacity). */
const preset = computed<GlassPreset>(() => {
  const name = (route.name as string | undefined) ?? ''
  if (name === 'auth.consent') return 'consent'
  if (name === 'auth.mfa-challenge') return 'mfa'
  if (name === 'error.not-found' || name === 'auth.callback') return 'error'
  return 'auth'
})
</script>

<template>
  <div
    class="bg-background text-foreground relative flex min-h-screen items-center justify-center px-4 py-12"
  >
    <a
      href="#auth-main"
      class="sr-only focus:not-sr-only focus:bg-primary focus:text-primary-foreground focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
    >
      Langsung ke konten utama
    </a>

    <!-- Restrained ambient blobs (design.md §6.1) — stops on prefers-reduced-motion -->
    <SsoGlassBackground :preset="preset" class="-z-10" />

    <ThemeToggleButton class="absolute right-4 top-4" />

    <main id="auth-main" class="sso-stagger w-full space-y-8">
      <div class="text-center">
        <AppBrandMark size="lg" class="mx-auto" />
        <h1
          class="font-serif mt-5 text-4xl font-light tracking-tight text-[var(--text-primary)] sm:text-5xl md:text-6xl"
          style="font-family: var(--font-serif)"
        >
          Dev-SSO
        </h1>
        <p class="text-[var(--text-secondary)] mt-2 text-sm font-medium leading-relaxed">
          Satu pintu untuk semua aplikasi kamu &mdash; tenang, aman, terverifikasi.
        </p>
      </div>

      <RouterView v-slot="{ Component }">
        <Transition name="glass-flow" mode="out-in">
          <component :is="Component" class="sso-card-alive" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.glass-flow-enter-active,
.glass-flow-leave-active {
  transition:
    opacity 320ms var(--ease-smooth),
    transform 320ms var(--ease-smooth),
    filter 320ms var(--ease-smooth);
}
.glass-flow-enter-from {
  opacity: 0;
  transform: translateY(0.75rem) scale(0.99);
  filter: blur(6px);
}
.glass-flow-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem) scale(0.99);
  filter: blur(4px);
}
@media (prefers-reduced-motion: reduce) {
  .glass-flow-enter-active,
  .glass-flow-leave-active {
    transition: opacity 200ms var(--ease-smooth);
  }
  .glass-flow-enter-from,
  .glass-flow-leave-to {
    transform: none;
    filter: none;
  }
}
</style>
