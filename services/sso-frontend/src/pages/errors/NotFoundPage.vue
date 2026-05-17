<script setup lang="ts">
/**
 * NotFoundPage — 404 fallback inside AuthLayout.
 *
 * REDESIGN: Liquid Glass × Austere Precision
 * Changed: visual shell only.
 * Frozen:  routing destinations.
 */

import { AlertTriangle, ArrowLeft, Home } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassCard from '@/components/molecules/SsoGlassCard.vue'
</script>

<template>
  <SsoGlassCard aria-labelledby="notfound-title">
    <template #header>
      <div class="flex flex-col items-center gap-3 text-center">
        <span
          class="grid size-12 place-items-center rounded-[var(--radius-glass-xl)] border border-[var(--glass-border-error)] bg-[color-mix(in_oklch,var(--color-error-50)_60%,transparent)] text-error-700"
          aria-hidden="true"
        >
          <AlertTriangle class="size-5" />
        </span>
        <h2
          id="notfound-title"
          class="text-heading-2 font-display font-semibold tracking-tight text-[var(--text-primary)]"
        >
          Halaman tidak ditemukan
        </h2>
        <p class="text-body-sm leading-relaxed text-[var(--text-secondary)]">
          URL yang kamu buka tidak terdaftar di portal. Kembali ke beranda atau halaman masuk untuk
          melanjutkan.
        </p>
      </div>
    </template>

    <div class="grid gap-3 sm:grid-cols-2">
      <SsoGlassButton variant="primary" size="fullWidth" @click="$router.push('/home')">
        <template #leading>
          <Home class="size-4" aria-hidden="true" />
        </template>
        Beranda
      </SsoGlassButton>
      <SsoGlassButton variant="glass" size="fullWidth" @click="$router.push('/')">
        <template #leading>
          <ArrowLeft class="size-4" aria-hidden="true" />
        </template>
        Halaman Masuk
      </SsoGlassButton>
    </div>
  </SsoGlassCard>
</template>
