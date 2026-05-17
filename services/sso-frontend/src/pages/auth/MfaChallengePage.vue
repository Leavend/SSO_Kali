<script setup lang="ts">
/**
 * MfaChallengePage — FR-019 / UC-67 MFA verification at login.
 *
 * REDESIGN: Liquid Glass × Austere Precision
 * Changed: visual shell only — SsoGlassCard + SsoGlassButton (primary CTA + ghost back link).
 *          Method selector remains as two visual segments. MfaTotpInput,
 *          MfaRecoveryInput, MfaChallengeTimer kept untouched (organism-level).
 * Frozen:  useMfaChallenge composable, autocomplete="one-time-code", auto-submit
 *          on 6-digit completion, expiry handling, resend cooldown, redirect on cancel.
 * WCAG:    AA compliant.
 */

import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Key, Shield } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassCard from '@/components/molecules/SsoGlassCard.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import MfaTotpInput from '@/components/mfa/MfaTotpInput.vue'
import MfaRecoveryInput from '@/components/mfa/MfaRecoveryInput.vue'
import MfaChallengeTimer from '@/components/mfa/MfaChallengeTimer.vue'
import { useMfaChallenge } from '@/composables/useMfaChallenge'
import { useMfaChallengeStore } from '@/stores/mfa-challenge.store'

const router = useRouter()
const challengeStore = useMfaChallengeStore()
const mfa = useMfaChallenge()

onMounted(() => {
  if (!challengeStore.challenge || challengeStore.isExpired()) {
    router.replace({ name: 'auth.login' })
  }
})
</script>

<template>
  <SsoGlassCard aria-labelledby="mfa-title">
    <template #header>
      <h2
        id="mfa-title"
        class="text-heading-1 font-display font-semibold tracking-tight text-[var(--text-primary)]"
      >
        Verifikasi identitasmu
      </h2>
      <p class="text-body-sm leading-relaxed text-[var(--text-secondary)]">
        Masukkan kode dari aplikasi authenticator atau gunakan recovery code.
      </p>
    </template>

    <form class="grid gap-5" novalidate @submit.prevent="mfa.submit">
      <SsoAlertBanner v-if="mfa.error.value" tone="error" :message="mfa.error.value" />

      <MfaChallengeTimer
        v-if="mfa.expiresAt.value"
        :expires-at="mfa.expiresAt.value"
        @expired="mfa.cancel"
      />

      <!-- Method selector — dua segmen yang setara secara visual -->
      <div class="flex gap-2" role="group" aria-label="Pilih metode verifikasi">
        <SsoGlassButton
          type="button"
          :variant="mfa.method.value === 'totp' ? 'primary' : 'glass'"
          size="sm"
          class="flex-1"
          :aria-pressed="mfa.method.value === 'totp'"
          @click="mfa.setMethod('totp')"
        >
          <template #leading>
            <Shield class="size-4" aria-hidden="true" />
          </template>
          Authenticator
        </SsoGlassButton>
        <SsoGlassButton
          type="button"
          :variant="mfa.method.value === 'recovery_code' ? 'primary' : 'glass'"
          size="sm"
          class="flex-1"
          :aria-pressed="mfa.method.value === 'recovery_code'"
          @click="mfa.setMethod('recovery_code')"
        >
          <template #leading>
            <Key class="size-4" aria-hidden="true" />
          </template>
          Recovery Code
        </SsoGlassButton>
      </div>

      <MfaTotpInput
        v-if="mfa.method.value === 'totp'"
        v-model="mfa.code.value"
        :disabled="mfa.pending.value"
        @complete="mfa.submit"
      />

      <MfaRecoveryInput
        v-if="mfa.method.value === 'recovery_code'"
        v-model="mfa.code.value"
        :disabled="mfa.pending.value"
      />

      <SsoGlassButton
        type="submit"
        variant="primary"
        size="fullWidth"
        :loading="mfa.pending.value"
        :disabled="mfa.pending.value || mfa.code.value.trim().length === 0"
      >
        {{ mfa.pending.value ? 'Memverifikasi…' : 'Verifikasi' }}
      </SsoGlassButton>

      <SsoGlassButton
        type="button"
        variant="ghost"
        size="sm"
        class="justify-center"
        @click="mfa.cancel"
      >
        <template #leading>
          <ArrowLeft class="size-3.5" aria-hidden="true" />
        </template>
        Kembali ke halaman masuk
      </SsoGlassButton>
    </form>
  </SsoGlassCard>
</template>
