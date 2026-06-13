<script setup lang="ts">
/**
 * PortalLayout — shell user portal.
 */

import { RouterView } from 'vue-router'
import { UserCircle2 } from 'lucide-vue-next'
import SsoGlassBackground from '@/components/atoms/SsoGlassBackground.vue'
import PortalHeader from '@/components/organisms/PortalHeader.vue'
import { useSessionHeartbeat } from '@/composables/useSessionHeartbeat'
import { useAuthRedirect } from '@/composables/useAuthRedirect'
import { useI18n } from '@/composables/useI18n'

const redirect = useAuthRedirect()
const { t } = useI18n()

useSessionHeartbeat({
  onExpired: () => redirect.toLogin(),
})
</script>

<template>
  <div
    data-testid="portal-shell"
    class="portal-shell relative flex min-h-screen flex-col overflow-hidden bg-[var(--background)] text-foreground"
  >
    <SsoGlassBackground data-testid="portal-background" preset="consent" />
    <div aria-hidden="true" class="portal-shell__wash pointer-events-none absolute inset-0" />
    <a
      href="#portal-main"
      class="sr-only focus:not-sr-only focus:bg-primary focus:text-primary-foreground focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
    >
      {{ t('auth.skip_link') }}
    </a>

    <PortalHeader />

    <main
      id="portal-main"
      class="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 pt-20 pb-6 sm:px-6 sm:pt-24 sm:pb-8"
      tabindex="-1"
    >
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <footer
      data-testid="portal-footer"
      class="portal-footer-glass relative z-10 mt-auto border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-primary)] py-6 text-center text-xs text-[var(--text-secondary)] backdrop-blur-[var(--glass-blur-md)]"
    >
      <div
        class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6"
      >
        <span class="flex items-center gap-2">
          <UserCircle2 class="size-4" /> Dev-SSO {{ t('portal.brand') }}
        </span>
        <span>{{ t('portal.footer', { year: new Date().getFullYear() }) }}</span>
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
