<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { FileText, KeyRound, RefreshCw, ShieldAlert, Users } from 'lucide-vue-next'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminDashboard } from '@/composables/useAdminDashboard'
import { useAdminConsoleStore } from '@/stores/admin-console.store'

const dashboard = useAdminDashboard()
const admin = useAdminConsoleStore()

onMounted((): void => {
  void dashboard.load()
})
</script>

<template>
  <section class="grid gap-6" aria-labelledby="admin-dashboard-title">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="grid gap-2">
        <p class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Admin · Dashboard
        </p>
        <h1 id="admin-dashboard-title" class="text-2xl font-bold tracking-tight">
          Ringkasan Operasional SSO
        </h1>
        <p class="text-muted-foreground max-w-3xl text-sm leading-relaxed">
          Health, sesi, client, audit, insiden, dan data subject request. Aksi cepat hanya muncul
          saat capability tersedia.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        class="min-h-11"
        :disabled="dashboard.loading.value"
        @click="dashboard.load"
      >
        <RefreshCw class="size-4" aria-hidden="true" />
        Muat ulang
      </Button>
    </header>

    <SsoAlertBanner v-if="dashboard.error.value" tone="error" :message="dashboard.error.value" />
    <p v-if="dashboard.supportReference.value" class="text-muted-foreground text-xs">
      {{ dashboard.supportReference.value }}
    </p>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Kartu ringkasan dashboard">
      <Card v-for="card in dashboard.cards.value" :key="card.label">
        <CardHeader>
          <CardDescription>{{ card.label }}</CardDescription>
          <CardTitle class="text-3xl">{{ card.value }}</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-muted-foreground text-sm">{{ card.detail }}</p>
        </CardContent>
      </Card>
      <template v-if="dashboard.loading.value">
        <Card v-for="index in 6" :key="index">
          <CardHeader>
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-9 w-16" />
          </CardHeader>
          <CardContent>
            <Skeleton class="h-4 w-40" />
          </CardContent>
        </Card>
      </template>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Aksi Cepat</CardTitle>
        <CardDescription
          >RBAC capability menentukan tombol yang dapat dilihat dan digunakan.</CardDescription
        >
      </CardHeader>
      <CardContent class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button v-if="admin.can('admin.users.write')" as-child class="min-h-11 justify-start">
          <RouterLink to="/admin/users"
            ><Users class="size-4" aria-hidden="true" />Kelola User</RouterLink
          >
        </Button>
        <Button
          v-if="admin.can('admin.clients.write')"
          as-child
          variant="outline"
          class="min-h-11 justify-start"
        >
          <RouterLink to="/admin/clients"
            ><KeyRound class="size-4" aria-hidden="true" />Kelola Client</RouterLink
          >
        </Button>
        <Button
          v-if="admin.can('admin.audit.read')"
          as-child
          variant="outline"
          class="min-h-11 justify-start"
        >
          <RouterLink to="/admin/audit"
            ><FileText class="size-4" aria-hidden="true" />Audit Trail</RouterLink
          >
        </Button>
        <Button
          v-if="admin.can('admin.audit.export')"
          as-child
          variant="outline"
          class="min-h-11 justify-start"
        >
          <RouterLink to="/admin/audit"
            ><ShieldAlert class="size-4" aria-hidden="true" />Export Audit</RouterLink
          >
        </Button>
      </CardContent>
    </Card>
  </section>
</template>
