<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Activity, AppWindow, KeyRound, ShieldCheck, UserRound } from 'lucide-vue-next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const shortcuts = [
  { to: '/profile', label: 'Profil', icon: UserRound, description: 'Kelola data akun dan identitas.' },
  { to: '/apps', label: 'Aplikasi Terhubung', icon: AppWindow, description: 'Cabut akses aplikasi yang kamu otorisasi.' },
  { to: '/sessions', label: 'Sesi Aktif', icon: Activity, description: 'Lihat dan akhiri sesi di perangkat lain.' },
  { to: '/security', label: 'Keamanan', icon: ShieldCheck, description: 'MFA, password, dan pengaturan login.' },
]

const welcome = computed(() => session.displayName || 'Pengguna')

onMounted(async () => {
  await Promise.all([session.loadMySessions(), session.loadConnectedApps()])
})
</script>

<template>
  <section class="grid gap-8">
    <header class="flex flex-col gap-2">
      <Badge variant="secondary" class="w-fit">Portal SSO</Badge>
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Halo, {{ welcome }} 👋</h1>
      <p class="text-muted-foreground max-w-xl text-sm">
        Ringkasan singkat akun SSO-mu. Gunakan pintasan di bawah untuk mengelola profil, aplikasi, dan keamanan.
      </p>
    </header>

    <div class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription>Sesi Aktif</CardDescription>
          <CardTitle class="text-3xl">{{ session.mySessions.length }}</CardTitle>
        </CardHeader>
        <CardContent class="text-muted-foreground text-xs">
          Sesi yang sedang aktif di perangkat dan aplikasi lain.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Aplikasi Terhubung</CardDescription>
          <CardTitle class="text-3xl">{{ session.connectedApps.length }}</CardTitle>
        </CardHeader>
        <CardContent class="text-muted-foreground text-xs">
          Aplikasi yang pernah kamu otorisasi lewat SSO.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Login Terakhir</CardDescription>
          <CardTitle class="text-lg">
            {{
              session.principal?.lastLoginAt
                ? new Date(session.principal.lastLoginAt).toLocaleString('id-ID')
                : '—'
            }}
          </CardTitle>
        </CardHeader>
        <CardContent class="text-muted-foreground text-xs">
          Berdasarkan audit trail Dev-SSO.
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <Card
        v-for="shortcut in shortcuts"
        :key="shortcut.to"
        class="group transition-colors hover:border-primary"
      >
        <CardHeader>
          <div class="flex items-center gap-3">
            <span class="bg-primary/15 text-primary grid size-10 place-items-center rounded-lg">
              <component :is="shortcut.icon" class="size-5" />
            </span>
            <div>
              <CardTitle>{{ shortcut.label }}</CardTitle>
              <CardDescription>{{ shortcut.description }}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button as-child variant="outline" size="sm">
            <router-link :to="shortcut.to">
              Buka
              <KeyRound class="ml-2 size-4" />
            </router-link>
          </Button>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
