<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'
import { portalUrl } from '@/config/adminEnvironment'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'

definePageMeta({
  name: 'admin.error',
  layout: false,
})

const { t } = useI18n()
// Absolute escape to the SSO portal so an admin is not trapped on this origin.
const portalHomeUrl = portalUrl()
</script>

<template>
  <UiStatusView
    tone="error"
    :eyebrow="t('admin.error.eyebrow')"
    :title="t('admin.error.title')"
    :description="t('admin.error.description')"
  >
    <template #actions>
      <UiButton :href="portalHomeUrl">{{ t('admin.error.back_to_portal') }}</UiButton>
    </template>
  </UiStatusView>
</template>
