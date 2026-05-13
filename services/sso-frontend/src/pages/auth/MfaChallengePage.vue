<script setup lang="ts">
/**
 * MfaChallengePage — FR-019 / UC-67.
 *
 * Halaman verifikasi MFA saat login. Ditampilkan setelah password berhasil
 * dan user memiliki TOTP enrolled. Logic di `useMfaChallenge`.
 */

import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Shield, Key } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  <Card class="shadow-card">
    <CardHeader class="gap-2">
      <CardTitle class="text-heading-1 font-display font-semibold tracking-tight">
        Verifikasi identitasmu
      </CardTitle>
      <CardDescription class="text-body-sm leading-relaxed">
        Masukkan kode dari aplikasi authenticator atau gunakan recovery code.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <form class="grid gap-5" novalidate @submit.prevent="mfa.submit">
        <SsoAlertBanner
          v-if="mfa.error.value"
          tone="error"
          :message="mfa.error.value"
        />

        <MfaChallengeTimer
          v-if="mfa.expiresAt.value"
          :expires-at="mfa.expiresAt.value"
          @expired="mfa.cancel"
        />

        <!-- Method selector -->
        <div class="flex gap-2">
          <Button
            type="button"
            :variant="mfa.method.value === 'totp' ? 'default' : 'outline'"
            size="sm"
            class="flex-1"
            @click="mfa.setMethod('totp')"
          >
            <Shield class="mr-1.5 size-4" aria-hidden="true" />
            Authenticator
          </Button>
          <Button
            type="button"
            :variant="mfa.method.value === 'recovery_code' ? 'default' : 'outline'"
            size="sm"
            class="flex-1"
            @click="mfa.setMethod('recovery_code')"
          >
            <Key class="mr-1.5 size-4" aria-hidden="true" />
            Recovery Code
          </Button>
        </div>

        <!-- TOTP input -->
        <MfaTotpInput
          v-if="mfa.method.value === 'totp'"
          v-model="mfa.code.value"
          :disabled="mfa.pending.value"
          @complete="mfa.submit"
        />

        <!-- Recovery code input -->
        <MfaRecoveryInput
          v-if="mfa.method.value === 'recovery_code'"
          v-model="mfa.code.value"
          :disabled="mfa.pending.value"
        />

        <Button
          type="submit"
          size="lg"
          class="w-full"
          :disabled="mfa.pending.value || mfa.code.value.trim().length === 0"
          :aria-busy="mfa.pending.value || undefined"
        >
          <span v-if="mfa.pending.value">Memverifikasi…</span>
          <span v-else>Verifikasi</span>
        </Button>

        <button
          type="button"
          class="text-muted-foreground text-caption hover:text-primary text-center transition-colors"
          @click="mfa.cancel"
        >
          Kembali ke halaman login
        </button>
      </form>
    </CardContent>
  </Card>
</template>
