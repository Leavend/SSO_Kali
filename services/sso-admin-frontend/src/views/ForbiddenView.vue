<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
</script>

<template>
  <main class="admin-shell">
    <section class="admin-shell__panel">
      <div class="hero-card">
        <span class="eyebrow">{{ t('admin.forbidden.eyebrow') }}</span>
        <h1>{{ t('admin.forbidden.title') }}</h1>
        <p>{{ t('admin.forbidden.description') }}</p>
        <div class="action-row" aria-label="Forbidden actions">
          <a class="button button--primary" href="/home">{{ t('admin.forbidden.back_to_portal') }}</a>
        </div>
      </div>
    </section>
  </main>
</template>
