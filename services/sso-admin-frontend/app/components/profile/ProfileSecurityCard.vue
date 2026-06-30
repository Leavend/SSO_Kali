<!-- app/components/profile/ProfileSecurityCard.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveMfaTone } from '@/lib/profile/profile-view-state'
import type { AdminPrincipal } from '@/types/auth.types'

export type ProfileSecurityLabels = {
  readonly title: string
  readonly mfa: string
  readonly mfaVerified: string
  readonly mfaEnforced: string
  readonly mfaOff: string
  readonly amr: string
  readonly acr: string
  readonly lastLogin: string
  readonly authTime: string
}

const props = defineProps<{
  readonly principal: AdminPrincipal
  readonly labels: ProfileSecurityLabels
}>()

const mfaLabel = computed<string>(() => {
  const ctx = props.principal.auth_context
  if (ctx.mfa_verified) return props.labels.mfaVerified
  if (ctx.mfa_enforced) return props.labels.mfaEnforced
  return props.labels.mfaOff
})

const amrText = computed<string>(() => props.principal.auth_context.amr.join(', ') || '—')
</script>

<template>
  <section class="profile-card" data-testid="profile-security" aria-labelledby="profile-security-title">
    <div class="profile-card__head">
      <h2 id="profile-security-title" class="profile-card__title">{{ labels.title }}</h2>
      <UiStatusBadge
        data-testid="profile-mfa-status"
        :tone="resolveMfaTone(principal.auth_context)"
        :label="`${labels.mfa}: ${mfaLabel}`"
      />
    </div>
    <dl class="profile-card__grid">
      <div class="profile-card__wide">
        <dt>{{ labels.amr }}</dt>
        <dd data-testid="profile-amr">{{ amrText }}</dd>
      </div>
      <div>
        <dt>{{ labels.acr }}</dt>
        <dd>{{ principal.auth_context.acr ?? '—' }}</dd>
      </div>
      <div>
        <dt>{{ labels.lastLogin }}</dt>
        <dd>
          <UiFolio v-if="principal.last_login_at" :value="principal.last_login_at" variant="timestamp" />
          <span v-else>—</span>
        </dd>
      </div>
      <div>
        <dt>{{ labels.authTime }}</dt>
        <dd data-testid="profile-auth-time">
          <UiFolio
            v-if="principal.auth_context.auth_time"
            :value="principal.auth_context.auth_time"
            variant="timestamp"
          />
          <span v-else>—</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.profile-card {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.profile-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.profile-card__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.profile-card__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.profile-card__wide {
  grid-column: 1 / -1;
}
.profile-card__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.profile-card__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
