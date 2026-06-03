<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Activity, AppWindow, ArrowRight, ShieldCheck, UserRound } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PortalPageHeader from '@/components/molecules/PortalPageHeader.vue'
import { useSessionStore } from '@/stores/session.store'
import { useProfileStore } from '@/stores/profile.store'

const session = useSessionStore()
const profile = useProfileStore()

const welcome = computed<string>(() => session.displayName || 'Pengguna')
const sessionsMetric = computed<string>(() =>
  profile.sessionsStatus === 'success' ? String(profile.sessions.length) : '—',
)
const connectedAppsMetric = computed<string>(() =>
  profile.connectedAppsStatus === 'success' ? String(profile.connectedApps.length) : '—',
)

const shortcuts = [
  {
    to: '/profile',
    label: 'Profil',
    icon: UserRound,
    description: 'Kelola data akun dan identitas yang tampil di portal.',
  },
  {
    to: '/apps',
    label: 'Aplikasi Terhubung',
    icon: AppWindow,
    description: 'Audit aplikasi yang pernah kamu otorisasi lewat SSO.',
  },
  {
    to: '/sessions',
    label: 'Sesi Aktif',
    icon: Activity,
    description: 'Pantau perangkat aktif dan akhiri sesi mencurigakan.',
  },
  {
    to: '/security',
    label: 'Keamanan',
    icon: ShieldCheck,
    description: 'Kelola MFA, password, dan kontrol login akun.',
  },
]

onMounted(async (): Promise<void> => {
  // Independent calls — one failure must not block others (FR-061).
  await Promise.allSettled([profile.loadSessions(), profile.loadConnectedApps()])
})
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      eyebrow="Dashboard Portal"
      :title="`Halo, ${welcome} 👋`"
      description="Ringkasan akun SSO-mu dalam satu kanvas liquid glass. Pantau profil, sesi, aplikasi, dan keamanan tanpa keluar dari portal."
      :icon="UserRound"
    />

    <div class="grid gap-4 md:grid-cols-3">
      <Card data-testid="home-metric-card" class="overflow-hidden">
        <CardHeader>
          <CardDescription>Sesi perangkat & aplikasi</CardDescription>
          <CardTitle
            data-testid="home-sessions-metric"
            class="font-display text-3xl"
            :class="{ 'animate-pulse': profile.sessionsStatus === 'loading' }"
          >
            {{ sessionsMetric }}
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3 text-xs text-[var(--text-secondary)]">
          <p v-if="profile.sessionsStatus === 'error'" data-testid="home-sessions-error">
            Gagal memuat sesi. Angka ini bukan indikator status login saat ini.
          </p>
          <p v-else>
            Ringkasan sesi dari perangkat dan aplikasi; bukan indikator apakah kamu sedang login.
          </p>
          <Button
            v-if="profile.sessionsStatus === 'error'"
            data-testid="home-sessions-retry"
            variant="outline"
            size="sm"
            @click="profile.loadSessions()"
          >
            Muat ulang
          </Button>
        </CardContent>
      </Card>
      <Card data-testid="home-metric-card" class="overflow-hidden">
        <CardHeader>
          <CardDescription>Aplikasi Terhubung</CardDescription>
          <CardTitle
            data-testid="home-connected-apps-metric"
            class="font-display text-3xl"
            :class="{ 'animate-pulse': profile.connectedAppsStatus === 'loading' }"
          >
            {{ connectedAppsMetric }}
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3 text-xs text-[var(--text-secondary)]">
          <p v-if="profile.connectedAppsStatus === 'error'" data-testid="home-connected-apps-error">
            Gagal memuat aplikasi terhubung.
          </p>
          <p v-else>Aplikasi yang pernah kamu otorisasi lewat SSO.</p>
          <Button
            v-if="profile.connectedAppsStatus === 'error'"
            data-testid="home-connected-apps-retry"
            variant="outline"
            size="sm"
            @click="profile.loadConnectedApps()"
          >
            Muat ulang
          </Button>
        </CardContent>
      </Card>
      <Card data-testid="home-metric-card" class="overflow-hidden">
        <CardHeader>
          <CardDescription>Peran</CardDescription>
          <CardTitle class="text-lg">
            {{ session.roles.length ? session.roles.join(', ') : '—' }}
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-[var(--text-secondary)]"
          >Diambil dari direktori SSO.</CardContent
        >
      </Card>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <Card
        v-for="shortcut in shortcuts"
        :key="shortcut.to"
        data-testid="home-shortcut-card"
        class="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:border-[var(--glass-border-brand)] hover:bg-[var(--glass-bg-elevated)] hover:shadow-[var(--shadow-glass-lg)]"
      >
        <CardHeader>
          <div class="flex items-center gap-3">
            <span
              class="sso-glass-pill grid size-11 place-items-center text-white shadow-[var(--shadow-glass-sm)]"
            >
              <component :is="shortcut.icon" class="relative z-[2] size-5" />
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
              <ArrowRight class="ml-2 size-4" />
            </router-link>
          </Button>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
