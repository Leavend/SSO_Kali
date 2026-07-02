<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { buildLoginUrl } from '@/lib/auth/admin-guard-resolver'
import { portalUrl } from '@/config/adminEnvironment'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'

definePageMeta({
  name: 'admin.step-up-required',
  layout: false,
})

const { t } = useI18n()
const route = useRoute()
const requestUrl = useRequestURL()
const config = useRuntimeConfig()

// Step-up means re-running the same-origin login flow (fresh auth_time + MFA):
// the BFF session's assurance only changes on a new authorization, so a portal
// visit can never satisfy it. prompt=login forces the IdP to re-authenticate
// instead of silently reusing the SSO session; return_to (set by the guard)
// survives the round-trip. The query value is untrusted — only same-origin
// paths pass, anything else falls back to the dashboard.
const stepUpLoginUrl = computed(() => {
  const raw = route.query.return_to
  const returnTo =
    typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
  const url = new URL(buildLoginUrl(returnTo, requestUrl.origin, config.public.basePath))
  url.searchParams.set('prompt', 'login')
  return url.toString()
})
const portalHomeUrl = portalUrl()
</script>

<template>
  <UiStatusView
    tone="step_up"
    :eyebrow="t('admin.mfa_required.step_up_eyebrow')"
    :title="t('admin.mfa_required.step_up_title')"
    :description="t('admin.mfa_required.step_up_description')"
  >
    <template #actions>
      <UiButton :href="stepUpLoginUrl">{{ t('admin.mfa_required.step_up_action') }}</UiButton>
      <UiButton variant="secondary" :href="portalHomeUrl">{{
        t('admin.mfa_required.secondary_action')
      }}</UiButton>
    </template>
  </UiStatusView>
</template>
