<script setup lang="ts">
/**
 * PortalUserMenu — molecule: avatar + display name + role badge + logout button.
 */

import { ref } from 'vue'
import { LogOut } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import AppAvatar from '@/components/molecules/AppAvatar.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import { useSessionStore } from '@/stores/session.store'
import { useAuthRedirect } from '@/composables/useAuthRedirect'

const session = useSessionStore()
const redirect = useAuthRedirect()

const showLogoutDialog = ref<boolean>(false)
const isLoggingOut = ref<boolean>(false)

function askLogout(): void {
  showLogoutDialog.value = true
}

async function confirmLogout(): Promise<void> {
  isLoggingOut.value = true
  await session.logout()
  redirect.toLogin()
}
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="flex items-center gap-2 rounded-full border py-0.5 pr-3 pl-0.5">
      <AppAvatar :name="session.user?.display_name" :email="session.user?.email" size="sm" class="ring-2 ring-background" />
      <div class="hidden text-xs leading-tight sm:flex sm:flex-col">
        <strong class="font-semibold">{{ session.user?.display_name ?? 'Pengguna' }}</strong>
        <span class="text-muted-foreground">{{ session.user?.email ?? '' }}</span>
      </div>
      <Badge v-if="session.user?.roles?.length" variant="secondary" class="hidden md:inline-flex">
        {{ session.user.roles[0] }}
      </Badge>
    </div>
    <Button variant="outline" size="icon" aria-label="Keluar" :disabled="isLoggingOut" @click="askLogout">
      <LogOut class="size-4" />
    </Button>

    <ConfirmDialog
      v-model:open="showLogoutDialog"
      title="Keluar dari portal?"
      description="Sesi di perangkat ini akan berakhir. Kamu harus login ulang untuk mengakses portal."
      confirm-label="Keluar"
      destructive
      @confirm="confirmLogout"
    />
  </div>
</template>
