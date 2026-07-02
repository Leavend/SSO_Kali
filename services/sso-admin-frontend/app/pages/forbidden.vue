<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'
import { portalUrl } from '@/config/adminEnvironment'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'

definePageMeta({
  name: 'admin.forbidden',
  layout: false,
})

const { t } = useI18n()
// Absolute escape to the SSO portal so an admin who lacks access is not trapped
// on this origin (a relative URL would dead-end them here).
const portalHomeUrl = portalUrl()
</script>

<template>
  <UiStatusView
    tone="forbidden"
    :eyebrow="t('admin.forbidden.eyebrow')"
    :title="t('admin.forbidden.title')"
    :description="t('admin.forbidden.description')"
  >
    <template #actions>
      <UiButton :href="portalHomeUrl">{{ t('admin.forbidden.back_to_portal') }}</UiButton>
    </template>
  </UiStatusView>
</template>
