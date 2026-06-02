<script setup lang="ts">
/**
 * LoginPage — UC-08 native login, Aurora multi-step.
 *
 * Visual: easemize-faithful 2-step flow (identifier → password). Each step
 * swaps the serif headline above the pill input. Final-step submit calls
 * `useLoginForm.submit()` with the same combined payload as before.
 *
 * Frozen behaviour:
 *   - useLoginForm composable, validation, retry-after, advisory CTA,
 *     autocomplete, error mapping. No backend call happens at step 1; the
 *     identifier is only validated for format client-side, so anti-enumeration
 *     copy is preserved (FR-014 + FR-016).
 *   - Going back from step 2 wipes the password buffer for safety.
 */

import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight, AtSign, Lock } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassInput from '@/components/atoms/SsoGlassInput.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useLoginForm } from '@/composables/useLoginForm'
import { cn } from '@/lib/utils'
import { useAuthSteps } from '@/composables/useAuthSteps'
import { useI18n } from '@/composables/useI18n'
import { useSessionStore } from '@/stores/session.store'
import { useSsoCompletion } from '@/composables/useSsoCompletion'

type LoginStepId = 'identifier' | 'password'

const login = useLoginForm()
const { t } = useI18n()
const route = useRoute()
const session = useSessionStore()
const ssoCompletion = useSsoCompletion()
const ssoCompletionPending = ref<boolean>(false)

const isIdentifierValid = computed<boolean>(() => login.form.identifier.trim().length > 0)
const showLoginForm = computed<boolean>(() => !ssoCompletionPending.value)

const steps = useAuthSteps<LoginStepId>([
  {
    id: 'identifier',
    canAdvance: () => isIdentifierValid.value,
    focusId: 'login-identifier',
  },
  {
    id: 'password',
    canAdvance: () => login.canSubmit.value,
    focusId: 'login-password',
    onLeave: () => {
      login.form.password = ''
    },
  },
])

const headline = computed<string>(() =>
  steps.current.value === 'identifier'
    ? t('auth.login.headline_identifier')
    : t('auth.login.headline_password'),
)
const tagline = computed<string>(() =>
  steps.current.value === 'identifier'
    ? t('auth.login.subtitle')
    : t('auth.login.password_subtitle'),
)

function onIdentifierEnter(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    steps.next()
  }
}

function onSubmit(event: Event): void {
  event.preventDefault()
  if (steps.current.value !== 'password') {
    steps.next()
    return
  }
  void login.submit()
}

onMounted(() => {
  void completePendingAuthRequest()
})

async function completePendingAuthRequest(): Promise<void> {
  const authRequestId = readAuthRequestId()
  if (!authRequestId) return

  ssoCompletionPending.value = true
  try {
    const sessionOk = session.isAuthenticated || (await session.ensureSession())
    if (!sessionOk) return

    const redirectUri = await ssoCompletion.complete(authRequestId)
    if (redirectUri) window.location.assign(redirectUri)
  } finally {
    ssoCompletionPending.value = false
  }
}

function readAuthRequestId(): string | null {
  const value = route.query['auth_request_id']
  return typeof value === 'string' && value.length > 0 ? value : null
}
</script>

<template>
  <section aria-labelledby="login-title" class="flex flex-col items-center gap-8">
    <header class="flex flex-col items-center gap-3 text-center">
      <h1
        id="login-title"
        class="text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl"
        style="font-family: var(--font-serif)"
      >
        {{ headline }}
      </h1>
      <p class="max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
        {{ tagline }}
      </p>
    </header>

    <div
      v-if="ssoCompletionPending"
      class="flex w-full max-w-md items-center justify-center rounded-2xl border border-border/60 bg-card/70 px-6 py-5 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur"
      role="status"
      aria-live="polite"
    >
      {{ t('auth.callback.title_loading') }}
    </div>

    <form
      v-if="showLoginForm"
      class="flex w-full max-w-md flex-col items-stretch gap-4"
      novalidate
      @submit="onSubmit"
    >
      <SsoAlertBanner
        v-if="login.bannerError.value"
        tone="error"
        :message="login.bannerError.value"
      />

      <a
        v-if="login.advisoryAction.value"
        data-testid="login-advisory-cta"
        :href="login.advisoryAction.value.href"
        class="text-center text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        {{ login.advisoryAction.value.label }} →
      </a>

      <Transition name="aurora-step" mode="out-in">
        <div
          v-if="steps.current.value === 'identifier'"
          key="step-identifier"
          class="flex flex-col items-stretch gap-3"
        >
          <SsoGlassInput
            id="login-identifier"
            v-model="login.form.identifier"
            type="text"
            autocomplete="username"
            inputmode="email"
            :placeholder="t('auth.login.identifier_placeholder')"
            :required="true"
            :autofocus="true"
            :disabled="login.pending.value"
            :error="login.fieldErrors.value['identifier'] ?? null"
            @keydown="onIdentifierEnter"
          >
            <template #leading>
              <AtSign class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </template>
            <template #trailing>
              <button
                type="button"
                :aria-label="t('auth.login.next_password_step')"
                :aria-hidden="!isIdentifierValid"
                :tabindex="isIdentifierValid ? 0 : -1"
                :disabled="!isIdentifierValid"
                :class="cn('sso-pill-action', isIdentifierValid && 'sso-pill-action--active')"
                @click="steps.next()"
              >
                <ArrowRight class="size-4" aria-hidden="true" />
              </button>
            </template>
          </SsoGlassInput>
        </div>

        <div
          v-else-if="steps.current.value === 'password'"
          key="step-password"
          class="flex flex-col items-stretch gap-3"
        >
          <SsoGlassInput
            id="login-password"
            v-model="login.form.password"
            type="password"
            autocomplete="current-password"
            :placeholder="t('auth.login.password_label')"
            :required="true"
            :autofocus="true"
            :disabled="login.pending.value"
            :error="login.fieldErrors.value['password'] ?? null"
          >
            <template #leading>
              <Lock class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </template>
          </SsoGlassInput>

          <p
            v-if="login.retryAfterSeconds.value > 0"
            class="text-center text-xs text-muted-foreground"
            aria-live="polite"
          >
            {{ t('auth.login.retry_after', { seconds: login.retryAfterSeconds.value }) }}
          </p>

          <SsoGlassButton
            type="submit"
            variant="vibrant"
            size="fullWidth"
            :loading="login.pending.value"
            :disabled="!login.canSubmit.value"
          >
            <template v-if="!login.pending.value" #trailing>
              <ArrowRight class="size-4" aria-hidden="true" />
            </template>
            {{ login.pending.value ? t('auth.login.submitting') : t('auth.login.submit') }}
          </SsoGlassButton>

          <button
            type="button"
            class="mt-1 inline-flex items-center justify-center gap-1.5 self-center text-sm text-muted-foreground transition-colors hover:text-foreground"
            @click="steps.back()"
          >
            <ArrowLeft class="size-3.5" aria-hidden="true" />
            {{ t('auth.login.change_identifier') }}
          </button>
        </div>
      </Transition>
    </form>

    <div class="flex flex-col items-center gap-2 text-sm text-muted-foreground">
      <RouterLink
        :to="{ name: 'auth.forgot-password' }"
        class="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {{ t('auth.login.forgot_password') }}
      </RouterLink>
      <p>
        {{ t('auth.login.no_account_prompt') }}
        <RouterLink
          :to="{ name: 'auth.register' }"
          class="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          {{ t('auth.login.register_now') }}
        </RouterLink>
      </p>
    </div>
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
