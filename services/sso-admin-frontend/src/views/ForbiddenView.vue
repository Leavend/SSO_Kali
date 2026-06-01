<script setup lang="ts">
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const portalHomeHref = new URL('/home', getAdminEnvironment().ssoBaseUrl).toString()
</script>

<template>
  <UiStatusView
    tone="forbidden"
    :eyebrow="t('admin.forbidden.eyebrow')"
    :title="t('admin.forbidden.title')"
    :description="t('admin.forbidden.description')"
  >
    <template #actions>
      <a class="button button--primary" :href="portalHomeHref">{{ t('admin.forbidden.back_to_portal') }}</a>
    </template>
  </UiStatusView>
</template>
