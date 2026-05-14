<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Activity, AppWindow, ShieldCheck, UserCircle2 } from 'lucide-vue-next'
import PageHeader from '@/web/components/PageHeader.vue'
import { useSessionStore } from '@/web/stores/session'

const session = useSessionStore()

const displayName = computed(() => session.principal?.displayName ?? 'Pengguna')
const role = computed(() => session.principal?.role ?? 'user')
const lastLogin = computed(() => session.principal?.lastLoginAt ?? null)
const sessionCount = computed(() => session.mySessions.length)
const connectedCount = computed(() => session.connectedApps.length)

const shortcuts = [
  { to: '/profile', label: 'Profil Saya', icon: UserCircle2, description: 'Lihat dan perbarui data profil.' },
  { to: '/apps', label: 'Aplikasi Terhubung', icon: AppWindow, description: 'Kelola aplikasi yang pernah kamu otorisasi.' },
  { to: '/sessions', label: 'Sesi Aktif', icon: Activity, description: 'Tinjau perangkat yang sedang login.' },
  { to: '/security', label: 'Keamanan', icon: ShieldCheck, description: 'Pengaturan MFA dan password.' },
] as const

onMounted(async () => {
  await Promise.all([session.loadMySessions(), session.loadConnectedApps()])
})
</script>

<template>
  <section class="home-view">
    <PageHeader
      eyebrow="Portal SSO"
      :title="`Halo, ${displayName}`"
      :description="`Kamu sedang masuk sebagai ${role}. Gunakan pintasan di bawah untuk mengelola akun SSO-mu.`"
    />

    <div class="home-stats" role="list">
      <article class="home-stat" role="listitem">
        <small>Sesi aktif</small>
        <strong>{{ sessionCount }}</strong>
        <p>Total sesi pada perangkat lain.</p>
      </article>
      <article class="home-stat" role="listitem">
        <small>Aplikasi terhubung</small>
        <strong>{{ connectedCount }}</strong>
        <p>Aplikasi yang pernah kamu otorisasi lewat SSO.</p>
      </article>
      <article class="home-stat" role="listitem">
        <small>Login terakhir</small>
        <strong>
          {{ lastLogin ? new Date(lastLogin).toLocaleString('id-ID') : '—' }}
        </strong>
        <p>Berdasarkan catatan audit Dev-SSO.</p>
      </article>
    </div>

    <div class="home-shortcuts" role="list">
      <RouterLink
        v-for="shortcut in shortcuts"
        :key="shortcut.to"
        :to="shortcut.to"
        class="home-shortcut"
        role="listitem"
      >
        <span class="home-shortcut__icon" aria-hidden="true">
          <component :is="shortcut.icon" :size="20" />
        </span>
        <strong>{{ shortcut.label }}</strong>
        <p>{{ shortcut.description }}</p>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.home-view {
  display: grid;
  gap: 28px;
  max-width: 1100px;
  margin: 0 auto;
}

.home-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.home-stat {
  padding: 18px 20px;
  border-radius: 18px;
  background: rgb(255 255 255 / 88%);
  border: 1px solid var(--line, rgb(15 23 42 / 8%));
  box-shadow: 0 14px 40px rgb(15 23 42 / 6%);
  display: grid;
  gap: 4px;
}

.home-stat small {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted, #64748b);
  font-weight: 700;
}

.home-stat strong {
  font-size: 28px;
  line-height: 1.1;
}

.home-stat p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
}

.home-shortcuts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.home-shortcut {
  display: grid;
  gap: 6px;
  padding: 20px;
  border-radius: 18px;
  border: 1px solid var(--line, rgb(15 23 42 / 8%));
  background: rgb(255 255 255 / 85%);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.18s ease, transform 0.18s ease;
}

.home-shortcut:hover {
  border-color: var(--accent, #2563eb);
  transform: translateY(-2px);
}

.home-shortcut__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent, #2563eb) 14%, transparent);
  color: var(--accent, #2563eb);
}

.home-shortcut strong {
  font-size: 15px;
  font-weight: 700;
}

.home-shortcut p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.5;
}
</style>
