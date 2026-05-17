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

    <main id="auth-main" class="w-full space-y-6">
      <div class="text-center">
        <AppBrandMark size="lg" class="mx-auto" />
        <h1 class="text-display font-display mt-4 text-2xl font-bold tracking-tight">Dev-SSO</h1>
        <p class="text-muted-foreground mt-1 text-sm leading-relaxed">
          Portal autentikasi tunggal untuk semua aplikasi kamu.
        </p>
      </div>

      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms var(--ease-smooth);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
