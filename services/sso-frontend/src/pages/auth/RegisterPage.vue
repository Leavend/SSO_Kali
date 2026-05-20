<script setup lang="ts">
/**
 * RegisterPage — Aurora multi-step registration orchestrator.
 *
 * Composition (atomic-design + standart-quality-code §1.1, §3.1):
 *   - useRegisterForm                      → state, validation, submit, redirect
 *   - molecules/RegisterEmailStep          → step 1: email pill + advance affordance
 *   - molecules/RegisterPasswordStep       → step 2: password pill + policy hints
 *   - molecules/RegisterConfirmStep        → step 3: confirm + name + submit CTA
 *
 * The page intentionally holds no business logic and no inline validators.
 * Test surface preserved (input ids and form structure unchanged) so the
 * existing `RegisterPage.spec.ts` keeps passing without edits.
 *
 * Frozen behaviour:
 *   - FR-014 contract: POST `/api/auth/register` with name/email/password +
 *     password_confirmation.
 *   - FR-015 / FR-062 password policy hints are surfaced inline.
 *   - 422 violations are translated and routed back to the originating step.
 *   - All non-Validation ApiError responses are routed through
 *     presentSafeError so internal stack/connection strings never leak.
 */

import RegisterConfirmStep from '@/components/molecules/RegisterConfirmStep.vue'
import RegisterEmailStep from '@/components/molecules/RegisterEmailStep.vue'
import RegisterPasswordStep from '@/components/molecules/RegisterPasswordStep.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useRegisterForm } from '@/composables/useRegisterForm'

const {
  form,
  pending,
  bannerError,
  bannerSuccess,
  fieldErrors,
  passwordHints,
  isEmailFormatted,
  isPasswordPolicyOk,
  steps,
  headline,
  tagline,
  onSubmit,
  onStepEnter,
} = useRegisterForm()
</script>

<template>
  <section aria-labelledby="register-title" class="flex flex-col items-center gap-8">
    <header class="flex flex-col items-center gap-3 text-center">
      <h1
        id="register-title"
        class="text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl"
        style="font-family: var(--font-serif)"
      >
        {{ headline }}
      </h1>
      <p class="max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
        {{ tagline }}
      </p>
    </header>

    <form class="flex w-full max-w-md flex-col items-stretch gap-4" novalidate @submit="onSubmit">
      <SsoAlertBanner v-if="bannerError" tone="error" :message="bannerError" />
      <SsoAlertBanner v-if="bannerSuccess" tone="success" :message="bannerSuccess" />

      <Transition name="aurora-step" mode="out-in">
        <RegisterEmailStep
          v-if="steps.current.value === 'email'"
          key="step-email"
          :model-value="form.email"
          :valid="isEmailFormatted"
          :pending="pending"
          :error="fieldErrors['email'] ?? null"
          @update:model-value="(value: string) => (form.email = value)"
          @advance="steps.next()"
          @enter="onStepEnter"
        />

        <RegisterPasswordStep
          v-else-if="steps.current.value === 'password'"
          key="step-password"
          :model-value="form.password"
          :valid="isPasswordPolicyOk"
          :pending="pending"
          :hints="passwordHints"
          :error="fieldErrors['password'] ?? null"
          @update:model-value="(value: string) => (form.password = value)"
          @advance="steps.next()"
          @back="steps.back()"
          @enter="onStepEnter"
        />

        <RegisterConfirmStep
          v-else
          key="step-confirm"
          :password-confirmation="form.password_confirmation"
          :name="form.name"
          :pending="pending"
          :can-submit="steps.canAdvance.value"
          :password-confirmation-error="fieldErrors['password_confirmation'] ?? null"
          :name-error="fieldErrors['name'] ?? null"
          @update:password-confirmation="(value: string) => (form.password_confirmation = value)"
          @update:name="(value: string) => (form.name = value)"
          @back="steps.back()"
        />
      </Transition>
    </form>

    <p class="text-center text-sm text-muted-foreground">
      Sudah punya akun?
      <RouterLink
        :to="{ name: 'auth.login' }"
        class="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
      >
        Masuk
      </RouterLink>
    </p>
  </section>
</template>

<style scoped>
.aurora-step-enter-active,
.aurora-step-leave-active {
  transition:
    opacity 240ms var(--ease-smooth),
    transform 240ms var(--ease-smooth),
    filter 240ms var(--ease-smooth);
}
.aurora-step-enter-from {
  opacity: 0;
  transform: translateY(0.4rem);
  filter: blur(4px);
}
.aurora-step-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
  filter: blur(4px);
}
@media (prefers-reduced-motion: reduce) {
  .aurora-step-enter-active,
  .aurora-step-leave-active {
    transition: opacity 160ms var(--ease-smooth);
  }
  .aurora-step-enter-from,
  .aurora-step-leave-to {
    transform: none;
    filter: none;
  }
}
</style>
