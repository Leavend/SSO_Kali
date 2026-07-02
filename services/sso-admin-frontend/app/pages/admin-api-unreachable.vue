<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'
import { portalUrl } from '@/config/adminEnvironment'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'

definePageMeta({
  name: 'admin.api-unreachable',
  layout: false,
})

const { t } = useI18n()
// Retry targets a guarded route on purpose: this page itself is static and
// unguarded, so reloading it would never re-probe the admin API. Navigating to
// /dashboard re-runs the session bootstrap and lands back here only if the API
// is still down.
const portalHomeUrl = portalUrl()
</script>

<template>
  <UiStatusView
    tone="api"
    :eyebrow="t('admin.api_unreachable.eyebrow')"
    :title="t('admin.api_unreachable.title')"
    :description="t('admin.api_unreachable.description')"
  >
    <template #actions>
      <UiButton href="/dashboard">{{ t('admin.api_unreachable.retry') }}</UiButton>
      <UiButton variant="secondary" :href="portalHomeUrl">{{
        t('admin.api_unreachable.back_to_portal')
      }}</UiButton>
    </template>
  </UiStatusView>
</template>
