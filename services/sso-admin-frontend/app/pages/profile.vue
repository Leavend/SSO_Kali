<!-- app/pages/profile.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { resolveProfileViewState } from '@/lib/profile/profile-view-state'
import ProfileIdentityCard, {
  type ProfileIdentityLabels,
} from '@/components/profile/ProfileIdentityCard.vue'
import ProfileSecurityCard, {
  type ProfileSecurityLabels,
} from '@/components/profile/ProfileSecurityCard.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'

definePageMeta({
  name: 'admin.profile',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['profile.read'],
})

const { t } = useI18n()
const store = useSessionStore()

// Same principal bootstrap as every admin page; the store dedups if already loaded.
await useAsyncData('admin-profile-principal', () => store.ensureSession())

const principal = computed(() => store.principal)
const viewState = computed(() => resolveProfileViewState({ principal: principal.value }))

const permissionList = computed<readonly string[]>(
  () => principal.value?.permissions.permissions ?? [],
)

const identityLabels = computed<ProfileIdentityLabels>(() => ({
  title: t('profile.identity_title'),
  email: t('profile.label_email'),
  subjectId: t('profile.label_subject_id'),
  givenName: t('profile.label_given_name'),
  familyName: t('profile.label_family_name'),
  role: t('profile.label_role'),
}))

const securityLabels = computed<ProfileSecurityLabels>(() => ({
  title: t('profile.security_title'),
  mfa: t('profile.label_mfa'),
  mfaVerified: t('profile.mfa_verified'),
  mfaEnforced: t('profile.mfa_enforced'),
  mfaOff: t('profile.mfa_off'),
  amr: t('profile.label_amr'),
  acr: t('profile.label_acr'),
  lastLogin: t('profile.label_last_login'),
  authTime: t('profile.label_auth_time'),
}))
</script>

<template>
  <section class="profile" data-page="profile" data-admin-shell>
    <header class="profile__hero">
      <span class="profile__eyebrow">{{ t('profile.eyebrow') }}</span>
      <h1 class="profile__title">{{ t('profile.title') }}</h1>
      <p class="profile__summary">{{ t('profile.summary') }}</p>
      <p class="profile__principal" data-principal-name>
        {{ t('profile.signed_in_as', { name: principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('profile.loading')" />

    <template v-else-if="principal">
      <div class="profile__grid">
        <ProfileIdentityCard :principal="principal" :labels="identityLabels" />
        <ProfileSecurityCard :principal="principal" :labels="securityLabels" />
      </div>

      <section class="profile__permissions" aria-labelledby="profile-permissions-title">
        <h2 id="profile-permissions-title" class="profile__permissions-title">
          {{ t('profile.permissions_title') }}
        </h2>
        <ul v-if="permissionList.length" class="profile__permissions-list" data-testid="profile-permissions">
          <li v-for="permission in permissionList" :key="permission" class="profile__permission">
            {{ permission }}
          </li>
        </ul>
        <p v-else class="profile__permissions-empty">{{ t('profile.permissions_empty') }}</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.profile {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.profile__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.profile__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.profile__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.profile__summary,
.profile__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.profile__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}
.profile__permissions {
  display: grid;
  gap: 10px;
}
.profile__permissions-title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.profile__permissions-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.profile__permission {
  padding: 4px 10px;
  font: 500 0.75rem/1.4 var(--font-mono, monospace);
  color: var(--fg-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.profile__permissions-empty {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
</style>
