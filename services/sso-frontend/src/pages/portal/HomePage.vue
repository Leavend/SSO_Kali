<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Activity, AppWindow, ArrowRight, ShieldCheck, UserRound } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PortalPageHeader from '@/components/molecules/PortalPageHeader.vue'
import { useSessionStore } from '@/stores/session.store'
import { useProfileStore } from '@/stores/profile.store'
import { useI18n } from '@/composables/useI18n'

const session = useSessionStore()
const profile = useProfileStore()
const { t } = useI18n()

const welcome = computed<string>(() => session.displayName || t('portal.home.user_fallback'))
const sessionsMetric = computed<string>(() =>
  profile.sessionsStatus === 'success' ? String(profile.sessions.length) : '—',
)
const connectedAppsMetric = computed<string>(() =>
  profile.connectedAppsStatus === 'success' ? String(profile.connectedApps.length) : '—',
)

const shortcuts = computed(() => [
  {
    to: '/profile',
    label: t('portal.nav.profile'),
    icon: UserRound,
    description: t('portal.home.shortcut_profile_desc'),
  },
  {
    to: '/apps',
    label: t('portal.home.apps_metric_desc'),
    icon: AppWindow,
    description: t('portal.home.shortcut_apps_desc'),
  },
  {
    to: '/sessions',
    label: t('portal.nav.sessions'),
    icon: Activity,
    description: t('portal.home.shortcut_sessions_desc'),
  },
  {
    to: '/security',
    label: t('portal.nav.security'),
    icon: ShieldCheck,
    description: t('portal.home.shortcut_security_desc'),
  },
])

onMounted(async (): Promise<void> => {
  // Independent calls — one failure must not block others (FR-061).
  await Promise.allSettled([profile.loadSessions(), profile.loadConnectedApps()])
})
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      :eyebrow="t('portal.home.eyebrow')"
      :title="t('portal.home.title', { name: welcome })"
      :description="t('portal.home.description')"
      :icon="UserRound"
    />

    <div class="grid gap-4 md:grid-cols-3">
      <Card data-testid="home-metric-card" class="overflow-hidden">
        <CardHeader>
          <CardDescription>{{ t('portal.home.sessions_metric_title') }}</CardDescription>
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
            {{ t('portal.home.sessions_metric_error') }}
          </p>
          <p v-else>
            {{ t('portal.home.sessions_metric_desc') }}
          </p>
          <Button
            v-if="profile.sessionsStatus === 'error'"
            data-testid="home-sessions-retry"
            variant="outline"
            size="sm"
            @click="profile.loadSessions()"
          >
            {{ t('common.retry') }}
          </Button>
        </CardContent>
      </Card>
      <Card data-testid="home-metric-card" class="overflow-hidden">
        <CardHeader>
          <CardDescription>{{ t('portal.home.apps_metric_desc') }}</CardDescription>
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
            {{ t('portal.home.apps_metric_error') }}
          </p>
          <p v-else>{{ t('portal.home.apps_metric_desc') }}</p>
          <Button
            v-if="profile.connectedAppsStatus === 'error'"
            data-testid="home-connected-apps-retry"
            variant="outline"
            size="sm"
            @click="profile.loadConnectedApps()"
          >
            {{ t('common.retry') }}
          </Button>
        </CardContent>
      </Card>
      <Card data-testid="home-metric-card" class="overflow-hidden">
        <CardHeader>
          <CardDescription>{{ t('portal.home.roles_title') }}</CardDescription>
          <CardTitle class="text-lg">
            {{ session.roles.length ? session.roles.join(', ') : '—' }}
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-[var(--text-secondary)]">
          {{ t('portal.home.roles_desc') }}
        </CardContent>
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
              {{ t('portal.home.btn_open') }}
              <ArrowRight class="ml-2 size-4" />
            </router-link>
          </Button>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
