<script setup lang="ts">
/**
 * PortalLayout — shell user portal.
 */

import { RouterView } from 'vue-router'
import { UserCircle2 } from 'lucide-vue-next'
import PortalHeader from '@/components/organisms/PortalHeader.vue'
import { useSessionHeartbeat } from '@/composables/useSessionHeartbeat'
import { useAuthRedirect } from '@/composables/useAuthRedirect'

const redirect = useAuthRedirect()

useSessionHeartbeat({
  onExpired: () => redirect.toLogin(),
})
</script>

<template>
  <div class="bg-background text-foreground flex min-h-screen flex-col">
    <a
      href="#portal-main"
      class="sr-only focus:not-sr-only focus:bg-primary focus:text-primary-foreground focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
    >
      Langsung ke konten utama
    </a>

    <PortalHeader />

    <main
      id="portal-main"
      class="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-6 sm:py-8"
      tabindex="-1"
    >
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <footer class="text-muted-foreground mt-auto border-t py-6 text-center text-xs">
      <div
        class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-3 sm:flex-row sm:px-6"
      >
        <span class="flex min-w-0 items-center gap-2 text-center sm:text-left">
          <UserCircle2 class="size-4 shrink-0" /> Dev-SSO Portal Pengguna
        </span>
        <span class="text-center sm:text-right">© {{ new Date().getFullYear() }} Dev-SSO Platform</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
