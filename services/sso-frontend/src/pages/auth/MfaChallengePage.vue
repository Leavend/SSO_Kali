<script setup lang="ts">
/**
 * MfaChallengePage — FR-019 / UC-67 MFA verification at login, Aurora redesign.
 *
 * Single-step page that renders its own headline. Method selector + organisms
 * preserved (MfaTotpInput, MfaRecoveryInput, MfaChallengeTimer).
 *
 * Frozen behaviour: useMfaChallenge composable, autocomplete="one-time-code",
 * auto-submit on 6-digit completion, expiry handling, resend cooldown,
 * redirect on cancel.
 */

import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Key, Shield } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
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
  <section aria-labelledby="mfa-title" class="flex flex-col items-center gap-8">
    <header class="flex flex-col items-center gap-3 text-center">
      <h1
        id="mfa-title"
        class="text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl"
        style="font-family: var(--font-serif)"
      >
        Verifikasi keamanan
      </h1>
      <p class="max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
        Masukkan kode dari aplikasi autentikasi atau gunakan kode cadangan.
      </p>
    </header>

    <form
      class="flex w-full max-w-md flex-col items-stretch gap-4"
      novalidate
      @submit.prevent="mfa.submit"
    >
      <SsoAlertBanner v-if="mfa.error.value" tone="error" :message="mfa.error.value" />

      <MfaChallengeTimer
        v-if="mfa.expiresAt.value"
        :expires-at="mfa.expiresAt.value"
        @expired="mfa.cancel"
      />

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
          Aplikasi Autentikasi
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
        variant="vibrant"
        size="fullWidth"
        :loading="mfa.pending.value"
        :disabled="mfa.pending.value || mfa.code.value.trim().length === 0"
      >
        {{ mfa.pending.value ? 'Memverifikasi…' : 'Verifikasi' }}
      </SsoGlassButton>
    </form>

    <button
      type="button"
      class="inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      @click="mfa.cancel"
    >
      <ArrowLeft class="size-3.5" aria-hidden="true" />
      Kembali ke halaman masuk
    </button>
  </section>
</template>
