<script setup lang="ts">
/**
 * NotFoundPage — 404 fallback inside AuthLayout, Aurora redesign.
 *
 * Frozen behaviour: routing destinations.
 */

import { ArrowLeft, Home } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
</script>

<template>
  <section aria-labelledby="notfound-title" class="flex flex-col items-center gap-8 text-center">
    <header class="flex flex-col items-center gap-3">
      <h1
        id="notfound-title"
        class="text-balance text-6xl font-light leading-none tracking-tight text-foreground sm:text-8xl"
        style="font-family: var(--font-serif)"
      >
        404
      </h1>
      <p class="max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
        Halaman yang kamu cari tidak terdaftar di portal. Kembali ke beranda atau halaman masuk
        untuk melanjutkan.
      </p>
    </header>

    <div class="grid w-full max-w-md gap-3 sm:grid-cols-2">
      <SsoGlassButton variant="vibrant" size="fullWidth" @click="$router.push('/home')">
        <template #leading>
          <Home class="size-4" aria-hidden="true" />
        </template>
        Beranda
      </SsoGlassButton>
      <SsoGlassButton variant="glass" size="fullWidth" @click="$router.push('/')">
        <template #leading>
          <ArrowLeft class="size-4" aria-hidden="true" />
        </template>
        Halaman masuk
      </SsoGlassButton>
    </div>
  </section>
</template>
