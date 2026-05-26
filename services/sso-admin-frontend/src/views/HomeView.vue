<script setup lang="ts">
import { computed, onMounted } from 'vue'
import ReadinessCard from '@/components/ReadinessCard.vue'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import { useReleaseReadinessStore } from '@/stores/releaseReadiness'
import { useSessionStore } from '@/stores/session.store'

const env = getAdminEnvironment()
const readiness = useReleaseReadinessStore()
const session = useSessionStore()
const totalGates = computed(() => readiness.items.length)
const progress = computed(() => {
  if (totalGates.value === 0) return 0
  return Math.round((readiness.readyCount / totalGates.value) * 100)
})
const canViewOidcFoundation = computed(() => session.hasPermission('admin.dashboard.view'))

onMounted(() => {
  void session.ensurePrincipal()
})
</script>

<template>
  <main class="admin-shell">
    <section class="admin-shell__panel">
      <div class="hero-card">
        <span class="eyebrow">Admin Frontend Control Plane</span>
        <h1>Dev-SSO admin frontend siap untuk migrasi bertahap.</h1>
        <p>
          Service ini adalah jalur paralel untuk migrasi ke stack terbaru. Trafik live tetap aman di
          service stabil sampai parity, smoke test, dan rollback gate lulus.
        </p>

        <div
          class="progress-bar"
          role="progressbar"
          :aria-valuenow="progress"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress-bar__fill" :style="{ width: `${progress}%` }" />
          <span class="progress-bar__label"
            >{{ readiness.readyCount }}/{{ totalGates }} gate lulus</span
          >
        </div>

        <div class="action-row" aria-label="Primary actions">
          <a class="button button--primary" :href="env.adminBaseUrl"> Buka Admin Stabil </a>
          <a
            class="button button--secondary"
            :href="`${env.ssoBaseUrl}/.well-known/openid-configuration`"
          >
            Cek Discovery SSO
          </a>
          <RouterLink
            v-if="canViewOidcFoundation"
            class="button button--secondary"
            :to="{ name: 'admin.oidc-foundation' }"
          >
            OIDC Foundation
          </RouterLink>
        </div>
      </div>

      <div class="readiness-grid" aria-label="Release readiness">
        <ReadinessCard v-for="item in readiness.items" :key="item.id" :item="item" />
      </div>
    </section>
  </main>
</template>
