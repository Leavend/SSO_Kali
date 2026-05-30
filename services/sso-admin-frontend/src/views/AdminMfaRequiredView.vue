<script setup lang="ts">
import { computed } from 'vue'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import { useI18n } from '@/composables/useI18n'

type AdminMfaRequiredMode = 'enrollment' | 'step_up'

interface Props {
  readonly mode: AdminMfaRequiredMode
}

const props = defineProps<Props>()
const { t } = useI18n()

const env = getAdminEnvironment()

const eyebrow = computed<string>(() =>
  props.mode === 'enrollment'
    ? t('admin.mfa_required.enrollment_eyebrow')
    : t('admin.mfa_required.step_up_eyebrow'),
)
const title = computed<string>(() =>
  props.mode === 'enrollment'
    ? t('admin.mfa_required.enrollment_title')
    : t('admin.mfa_required.step_up_title'),
)
const description = computed<string>(() =>
  props.mode === 'enrollment'
    ? t('admin.mfa_required.enrollment_description')
    : t('admin.mfa_required.step_up_description'),
)
const primaryLabel = computed<string>(() =>
  props.mode === 'enrollment'
    ? t('admin.mfa_required.enrollment_action')
    : t('admin.mfa_required.step_up_action'),
)
const primaryHref = computed<string>(() =>
  props.mode === 'enrollment' ? portalUrl('/security/mfa') : stepUpUrl(),
)
const portalHomeHref = computed<string>(() => portalUrl('/home'))

function portalUrl(path: string): string {
  return new URL(path, env.ssoBaseUrl).toString()
}

function stepUpUrl(): string {
  const url = new URL('/', env.ssoBaseUrl)
  url.searchParams.set('redirect', normalizeReturnPath())
  return url.toString()
}

function normalizeReturnPath(): string {
  const base = env.publicBasePath.startsWith('/') ? env.publicBasePath : `/${env.publicBasePath}`
  return base.endsWith('/') ? base : `${base}/`
}
</script>

<template>
  <main class="admin-shell">
    <section class="admin-shell__panel">
      <div class="hero-card">
        <span class="eyebrow">{{ eyebrow }}</span>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
        <div class="action-row" aria-label="Admin MFA required actions">
          <a
            data-testid="admin-mfa-primary-action"
            class="button button--primary"
            :href="primaryHref"
          >
            {{ primaryLabel }}
          </a>
          <a class="button button--secondary" :href="portalHomeHref">
            {{ t('admin.mfa_required.secondary_action') }}
          </a>
        </div>
      </div>
    </section>
  </main>
</template>
