<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { WifiOff } from 'lucide-vue-next'
import AuthLayout from '@/components/layouts/AuthLayout.vue'
import PortalLayout from '@/components/layouts/PortalLayout.vue'
import { useThemeStore } from '@/stores/theme.store'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const route = useRoute()
const theme = useThemeStore()
const { isOnline, cleanup } = useNetworkStatus()

const Layout = computed(() => (route.meta.layout === 'portal' ? PortalLayout : AuthLayout))

onMounted((): void => {
  theme.initialize()
  // Session hydration is handled by router.beforeEach for auth-gated routes.
  // Calling ensureSession here would duplicate the request and block main thread
  // during LCP measurement window on hard refresh (affects render delay).
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<template>
  <!-- Global offline banner (FR-007) -->
  <Transition name="slide-down">
    <div
      v-if="!isOnline"
      role="alert"
      aria-live="assertive"
      class="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-destructive-foreground text-sm font-medium shadow-lg"
    >
      <WifiOff class="size-4 shrink-0" aria-hidden="true" />
      Koneksi terputus. Periksa jaringan dan coba lagi.
    </div>
  </Transition>

  <component :is="Layout" :class="{ 'pt-10': !isOnline }" />
</template>
