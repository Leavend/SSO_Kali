<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'
import { portalUrl } from '@/config/adminEnvironment'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'

definePageMeta({
  name: 'admin.mfa-required',
  layout: false,
})

const { t } = useI18n()
// Enrollment happens on the portal's MFA security surface, not the portal home;
// after enrolling, the admin returns here and the guard re-evaluates.
const mfaEnrollUrl = portalUrl('/security/mfa')
const portalHomeUrl = portalUrl()
</script>

<template>
  <UiStatusView
    tone="step_up"
    :eyebrow="t('admin.mfa_required.enrollment_eyebrow')"
    :title="t('admin.mfa_required.enrollment_title')"
    :description="t('admin.mfa_required.enrollment_description')"
  >
    <template #actions>
      <UiButton :href="mfaEnrollUrl">{{ t('admin.mfa_required.enrollment_action') }}</UiButton>
      <UiButton variant="secondary" :href="portalHomeUrl">{{
        t('admin.mfa_required.secondary_action')
      }}</UiButton>
    </template>
  </UiStatusView>
</template>
