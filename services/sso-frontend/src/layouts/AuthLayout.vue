<script setup lang="ts">
import { Moon, ShieldCheck, Sun } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
</script>

<template>
  <div class="bg-background text-foreground relative flex min-h-screen items-center justify-center px-4 py-12">
    <div
      class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,_var(--color-primary)_18%,_transparent)_0%,_transparent_55%)]"
      aria-hidden="true"
    />

    <Button
      class="absolute top-4 right-4"
      variant="ghost"
      size="icon"
      aria-label="Ganti tema"
      @click="theme.toggle"
    >
      <Sun v-if="theme.mode === 'dark'" class="size-4" />
      <Moon v-else class="size-4" />
    </Button>

    <div class="w-full max-w-md space-y-6">
      <div class="text-center">
        <span
          class="bg-primary text-primary-foreground mx-auto inline-flex size-10 items-center justify-center rounded-2xl shadow-md"
        >
          <ShieldCheck class="size-5" />
        </span>
        <h1 class="mt-4 text-2xl font-bold tracking-tight">Dev-SSO</h1>
        <p class="text-muted-foreground mt-1 text-sm">Portal autentikasi tunggal untuk semua aplikasi kamu.</p>
      </div>
      <slot />
    </div>
  </div>
</template>
