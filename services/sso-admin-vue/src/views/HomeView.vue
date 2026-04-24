<script setup lang="ts">
import ReadinessCard from '@/components/ReadinessCard.vue'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import { useReleaseReadinessStore } from '@/stores/releaseReadiness'

const env = getAdminEnvironment()
const readiness = useReleaseReadinessStore()
</script>

<template>
  <main class="admin-shell">
    <section class="admin-shell__panel">
      <div class="hero-card">
        <span class="eyebrow">Vue Canary Control Plane</span>
        <h1>Dev-SSO admin shell siap untuk migrasi bertahap.</h1>
        <p>
          Service ini adalah jalur paralel untuk migrasi Laravel latest + Vue latest. Trafik live
          tetap aman di service stabil sampai parity, smoke test, dan rollback gate lulus.
        </p>

        <div class="action-row" aria-label="Primary actions">
          <a class="button button--primary" :href="env.adminBaseUrl">Buka admin stabil</a>
          <a
            class="button button--secondary"
            :href="`${env.ssoBaseUrl}/.well-known/openid-configuration`"
          >
            Cek discovery SSO
          </a>
        </div>
      </div>

      <div class="readiness-grid" aria-label="Release readiness">
        <ReadinessCard v-for="item in readiness.items" :key="item.id" :item="item" />
      </div>
    </section>
  </main>
</template>
