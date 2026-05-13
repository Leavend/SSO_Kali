<script setup lang="ts">
/**
 * AuthLayout — shell untuk halaman publik (login, error). Single column, centered.
 */

import AppBrandMark from '@/components/atoms/AppBrandMark.vue'
import ThemeToggleButton from '@/components/atoms/ThemeToggleButton.vue'
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="bg-background text-foreground relative flex min-h-screen items-center justify-center px-4 py-12">
    <a
      href="#auth-main"
      class="sr-only focus:not-sr-only focus:bg-primary focus:text-primary-foreground focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
    >
      Langsung ke konten utama
    </a>

    <div
      class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,_var(--color-primary)_14%,_transparent)_0%,_transparent_55%)]"
      aria-hidden="true"
    />

    <ThemeToggleButton class="absolute right-4 top-4" />

    <main id="auth-main" class="w-full max-w-md space-y-6">
      <div class="text-center">
        <AppBrandMark size="lg" class="mx-auto" />
        <h1 class="mt-4 text-2xl font-bold tracking-tight">Dev-SSO</h1>
        <p class="text-muted-foreground mt-1 text-sm">
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
  transition: opacity 180ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
