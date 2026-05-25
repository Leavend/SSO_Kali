<script setup lang="ts">
/**
 * MfaSettingsPage — FR-019, FR-020 / UC-49, UC-69.
 *
 * Step wizard untuk MFA enrollment + manajemen kode cadangan:
 *   1. Status → 2. Scan QR → 3. Verify Code → 4. Save Kode Cadangan
 *   + Status dan regenerasi kode cadangan (post-enrollment).
 *
 * Level: Page (orchestrates composable, < 50 lines script setup).
 */

import { onMounted, ref } from 'vue'
import { useMfaEnrollment } from '@/composables/useMfaEnrollment'
import MfaStatusCard from '@/components/mfa/MfaStatusCard.vue'
import TotpQrCode from '@/components/mfa/TotpQrCode.vue'
import TotpVerifyStep from '@/components/mfa/TotpVerifyStep.vue'
import RecoveryCodesDisplay from '@/components/mfa/RecoveryCodesDisplay.vue'
import RecoveryCodesStatus from '@/components/mfa/RecoveryCodesStatus.vue'
import RecoveryCodesRegenerateDialog from '@/components/mfa/RecoveryCodesRegenerateDialog.vue'
import MfaRemoveDialog from '@/components/mfa/MfaRemoveDialog.vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PortalPageHeader from '@/components/molecules/PortalPageHeader.vue'
import { ArrowLeft, ShieldCheck } from 'lucide-vue-next'

const mfa = useMfaEnrollment()
const showRemoveDialog = ref(false)
const showRegenerateDialog = ref(false)

onMounted(() => void mfa.fetchStatus())

async function handleVerify(code: string): Promise<void> {
  await mfa.verifyCode(code)
}

async function handleRemove(password: string): Promise<void> {
  const success = await mfa.remove(password)
  if (success) showRemoveDialog.value = false
}

async function handleRegenerate(password: string): Promise<void> {
  const success = await mfa.regenerateCodes(password)
  if (success) showRegenerateDialog.value = false
}
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      eyebrow="Authenticator"
      title="Pengaturan MFA"
      description="Kelola verifikasi dua langkah, aplikasi autentikasi, dan kode cadangan untuk akun kamu."
      :icon="ShieldCheck"
    >
      <template #actions>
        <Button as-child variant="outline" size="sm" class="w-full sm:w-fit">
          <RouterLink :to="{ name: 'portal.security' }" aria-label="Kembali ke halaman keamanan">
            <ArrowLeft class="size-4" />
            Kembali
          </RouterLink>
        </Button>
      </template>
    </PortalPageHeader>

    <!-- Status Card (idle state) -->
    <MfaStatusCard
      v-if="mfa.step.value === 'idle' || mfa.step.value === 'complete'"
      :enrolled="mfa.isEnrolled.value"
      :pending="mfa.pending.value"
      :last-verified-at="mfa.status.value?.totp_verified_at ?? null"
      @enable="mfa.startEnrollment()"
      @disable="showRemoveDialog = true"
    />

    <!-- Status kode cadangan (shown when enrolled and idle) -->
    <RecoveryCodesStatus
      v-if="(mfa.step.value === 'idle' || mfa.step.value === 'complete') && mfa.isEnrolled.value"
      :remaining="mfa.recoveryCodesRemaining.value"
      :pending="mfa.pending.value"
      @regenerate="showRegenerateDialog = true"
    />

    <!-- Enrollment Wizard -->
    <Card v-if="mfa.step.value === 'scanning' && mfa.enrollData.value">
      <CardHeader>
        <CardTitle class="text-base font-semibold"> Langkah 1: Scan QR Code </CardTitle>
      </CardHeader>
      <CardContent class="grid gap-4">
        <TotpQrCode
          :provisioning-uri="mfa.enrollData.value.provisioning_uri"
          :secret="mfa.enrollData.value.secret"
        />
        <Button
          variant="default"
          size="sm"
          class="mx-auto w-fit"
          @click="mfa.step.value = 'verifying'"
        >
          Lanjut ke Verifikasi
        </Button>
      </CardContent>
    </Card>

    <!-- Verify Step -->
    <Card v-if="mfa.step.value === 'verifying'">
      <CardHeader>
        <CardTitle class="text-base font-semibold"> Langkah 2: Verifikasi Kode </CardTitle>
      </CardHeader>
      <CardContent>
        <TotpVerifyStep
          :pending="mfa.pending.value"
          :error="mfa.error.value"
          @verify="handleVerify"
        />
      </CardContent>
    </Card>

    <!-- Kode cadangan (after enrollment or regeneration) -->
    <Card v-if="mfa.step.value === 'recovery' && mfa.recoveryCodes.value.length > 0">
      <CardHeader>
        <CardTitle class="text-base font-semibold"> Simpan Kode Cadangan </CardTitle>
      </CardHeader>
      <CardContent>
        <RecoveryCodesDisplay
          :codes="mfa.recoveryCodes.value"
          @acknowledged="mfa.completeSetup()"
        />
      </CardContent>
    </Card>

    <!-- Success state -->
    <div
      v-if="mfa.step.value === 'complete' && mfa.isEnrolled.value"
      class="rounded-[var(--radius-glass-xl)] border border-green-200/70 bg-green-50/70 px-4 py-3 shadow-[var(--shadow-glass-sm)] backdrop-blur-[var(--glass-blur-sm)] dark:border-green-800 dark:bg-green-950"
      role="status"
    >
      <p class="text-sm text-green-800 dark:text-green-200">
        ✓ MFA berhasil diaktifkan. Akun kamu sekarang dilindungi dengan verifikasi dua langkah.
      </p>
    </div>

    <!-- Remove Dialog -->
    <MfaRemoveDialog
      :open="showRemoveDialog"
      :pending="mfa.pending.value"
      :error="mfa.error.value"
      @update:open="showRemoveDialog = $event"
      @confirm="handleRemove"
    />

    <!-- Regenerate Dialog -->
    <RecoveryCodesRegenerateDialog
      :open="showRegenerateDialog"
      :pending="mfa.pending.value"
      :error="mfa.error.value"
      @update:open="showRegenerateDialog = $event"
      @confirm="handleRegenerate"
    />
  </section>
</template>
