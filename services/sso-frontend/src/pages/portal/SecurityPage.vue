<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'
import PortalPageHeader from '@/components/molecules/PortalPageHeader.vue'
import SecurityAccessCard from '@/components/organisms/SecurityAccessCard.vue'
import SecurityAuditLogCard from '@/components/organisms/SecurityAuditLogCard.vue'
import SecurityMfaCard from '@/components/organisms/SecurityMfaCard.vue'
import SecurityPasswordSection from '@/components/organisms/SecurityPasswordSection.vue'
import SecurityRiskCard from '@/components/organisms/SecurityRiskCard.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useMfaEnrollment } from '@/composables/useMfaEnrollment'
import { useChangePassword } from '@/composables/usePasswordLifecycle'
import { useAsyncAction } from '@/composables/useAsyncAction'
import {
  knownLoginIpAddresses,
  oauthScopeTokens,
  presentMfaSummary,
  presentRiskScore,
} from '@/lib/portal-security'
import { useProfileStore } from '@/stores/profile.store'
import { profileApi } from '@/services/profile.api'
import type { AuditEvent } from '@/types/audit.types'
import type { ChangePasswordPayload } from '@/types/profile.types'

const profile = useProfileStore()
const load = useAsyncAction(() => profile.loadProfile())
const auditLoad = useAsyncAction(() => profileApi.getAuditEvents(undefined, 10))
const mfa = useMfaEnrollment()
const password = useChangePassword()

const auditEvents = computed<readonly AuditEvent[]>(() => auditLoad.lastResult.value?.events ?? [])
const knownLoginIps = computed<ReadonlySet<string>>(() => knownLoginIpAddresses(auditEvents.value))
const mfaEnabled = computed<boolean>(
  () => mfa.isEnrolled.value || Boolean(profile.profile?.security.mfa_required),
)
const mfaSummary = computed<string>(() =>
  presentMfaSummary(mfa.status.value, Boolean(profile.profile?.security.mfa_required)),
)
const riskPresentation = computed(() => presentRiskScore(profile.profile?.security.risk_score ?? 0))
const lastSeen = computed<string | null>(() => profile.profile?.security.last_seen_at ?? null)
const userRoles = computed<readonly string[]>(() => profile.profile?.authorization.roles ?? [])
const userPermissions = computed<readonly string[]>(
  () => profile.profile?.authorization.permissions ?? [],
)
const userScopes = computed<readonly string[]>(() =>
  oauthScopeTokens(profile.profile?.authorization.scope ?? ''),
)
const showPasswordForm = computed<boolean>(() => password.success.value === null)

onMounted(() => {
  if (!profile.profile) void load.run()
  void auditLoad.run()
  void mfa.fetchStatus()
})

function updatePasswordField(field: keyof ChangePasswordPayload, value: string): void {
  password.updateField(field, value)
}
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      eyebrow="Pusat Keamanan"
      title="Keamanan"
      description="Kelola MFA, password, risiko login, dan riwayat keamanan dari satu halaman terpusat."
      :icon="ShieldCheck"
    />

    <div v-if="load.pending.value" class="grid gap-4 md:grid-cols-2">
      <Skeleton v-for="i in 2" :key="i" class="h-44 rounded-xl" />
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2">
      <SecurityMfaCard :is-enabled="mfaEnabled" :summary="mfaSummary" :error="mfa.error.value" />
      <SecurityRiskCard :risk="riskPresentation" />
    </div>

    <SecurityPasswordSection
      v-if="!load.pending.value"
      :form="password.form"
      :errors="password.fieldErrors.value"
      :strength-items="password.strengthItems.value"
      :strength-requirements="password.strengthRequirements.value"
      :strength-summary="password.strengthSummary.value"
      :is-pending="password.pending.value"
      :can-submit="password.canSubmit.value"
      :success="password.success.value"
      :error="password.error.value"
      :last-seen="lastSeen"
      :show-form="showPasswordForm"
      @update:field="updatePasswordField"
      @submit="password.submit"
      @reset="password.reset"
    />

    <SecurityAccessCard
      v-if="!load.pending.value && profile.profile"
      :roles="userRoles"
      :permissions="userPermissions"
      :scopes="userScopes"
    />

    <SecurityAuditLogCard
      :events="auditEvents"
      :known-login-ips="knownLoginIps"
      :is-pending="auditLoad.pending.value"
    />
  </section>
</template>
