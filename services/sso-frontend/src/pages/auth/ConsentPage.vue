<script setup lang="ts">
/**
 * ConsentPage — UC-13 explicit OAuth consent decision, Aurora redesign.
 *
 * Single-step page that renders its own headline + scope cards + buttons.
 *
 * DOM ORDER PRESERVED: Deny rendered FIRST as <button>, Allow SECOND.
 * ConsentPage.spec relies on `wrapper.get('button')` → Deny and
 * `button:not([disabled]) + button` → Allow.
 *
 * Frozen behaviour: fetchConsentDetails / submitConsentDecision API calls,
 * safeConsentErrorCopy mapping, unknown-scope warning, scope merging,
 * all error copy, PKCE / authorization code flow.
 */

import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { AlertTriangle, Check, ShieldAlert, X } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import {
  hasUntrustedScopes,
  mergeBackendScopes,
  resolveScopeList,
  type ScopeDescriptor,
} from '@/lib/oidc/scope-labels'
import {
  fetchConsentDetails,
  submitConsentDecision,
  type ConsentDecision,
  type ConsentDetails,
} from '@/services/consent.api'
import { isApiError } from '@/lib/api/api-error'
import { useI18n } from '@/composables/useI18n'

const route = useRoute()
const { t } = useI18n()

function safeConsentErrorCopy(error: unknown, fallback: string): string {
  if (!isApiError(error)) return fallback
  if (error.status === 419) return t('api.status_419')
  if (error.status === 429) return t('api.status_429')
  if (error.status === 401) return t('api.status_401')
  if (error.status === 403) return t('auth.consent.forbidden')
  if (error.status === 0 || error.status >= 500) return t('api.status_5xx')
  return fallback
}

const consent = ref<ConsentDetails | null>(null)
const loading = ref(true)
const submitting = ref<ConsentDecision | null>(null)
const errorMessage = ref('')

const clientName = computed<string>(
  () => consent.value?.client.display_name ?? String(route.query['client_id'] ?? ''),
)
const state = computed<string>(() => String(route.query['state'] ?? ''))
const rawScope = computed<string>(() => String(route.query['scope'] ?? 'openid'))

const scopes = computed<readonly ScopeDescriptor[]>(() => {
  const requested = (rawScope.value || 'openid').split(/\s+/u).filter((token) => token !== '')
  const backendScopes = consent.value?.scopes ?? []

  if (requested.length === 0 && backendScopes.length === 0) return resolveScopeList(rawScope.value)

  const requestedNames = requested.length > 0 ? requested : backendScopes.map((scope) => scope.name)
  const backendDescriptions = new Map<string, string>(
    backendScopes.map((scope) => [scope.name, scope.description]),
  )

  return mergeBackendScopes(requestedNames, backendDescriptions)
})

const hasUntrustedAccess = computed<boolean>(() => hasUntrustedScopes(scopes.value))
const canDecide = computed<boolean>(
  () => Boolean(consent.value?.state) && !loading.value && !submitting.value,
)

onMounted(async () => {
  const requestedClientId = String(route.query['client_id'] ?? '')
  if (!requestedClientId || !state.value) {
    loading.value = false
    errorMessage.value = t('auth.consent.incomplete')
    return
  }

  try {
    consent.value = await fetchConsentDetails({
      clientId: requestedClientId,
      scope: rawScope.value,
      state: state.value,
    })
  } catch (error) {
    errorMessage.value = safeConsentErrorCopy(error, t('auth.consent.load_failure'))
  } finally {
    loading.value = false
  }
})

async function decide(decision: ConsentDecision): Promise<void> {
  if (!consent.value || submitting.value) return

  submitting.value = decision
  errorMessage.value = ''

  try {
    const result = await submitConsentDecision({
      state: consent.value.state,
      decision,
    })
    window.location.assign(result.redirect_uri)
  } catch (error) {
    errorMessage.value = safeConsentErrorCopy(error, t('auth.consent.submit_failure'))
  } finally {
    submitting.value = null
  }
}

function scopeLevelClass(level: ScopeDescriptor['level']): string {
  switch (level) {
    case 'unknown':
    case 'unverified':
      return 'border-destructive/50 text-destructive-foreground'
    case 'sensitive':
      return 'border-yellow-400/50 text-foreground'
    default:
      return 'border-border text-foreground'
  }
}

function shouldShowScopeStatus(scope: ScopeDescriptor): boolean {
  return Boolean(scope.statusLabel)
}
</script>

<template>
  <section aria-labelledby="consent-title" class="flex w-full flex-col items-center gap-7">
    <header class="flex flex-col items-center gap-3 text-center">
      <h1
        id="consent-title"
        class="text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl"
        style="font-family: var(--font-serif)"
      >
        {{ t('auth.consent.title') }}
      </h1>
      <p class="max-w-md text-sm font-medium leading-relaxed text-muted-foreground">
        {{
          t('auth.consent.description_prefix', {
            client: clientName || t('auth.consent.unknown_client'),
          })
        }}
      </p>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="flex w-full items-start gap-2 rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive-foreground backdrop-blur-md"
    >
      <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </p>

    <p
      v-if="hasUntrustedAccess"
      role="alert"
      class="flex w-full items-start gap-2 rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive-foreground backdrop-blur-md"
    >
      <ShieldAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {{ t('auth.consent.untrusted_warning') }}
      </span>
    </p>

    <p v-if="loading" class="text-sm text-muted-foreground" aria-live="polite">
      {{ t('auth.consent.loading') }}
    </p>

    <div v-else-if="scopes.length > 0" class="flex w-full flex-col gap-3">
      <p class="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {{ t('auth.consent.requested_permissions') }}
      </p>
      <ul class="flex flex-col gap-2">
        <li v-for="scope in scopes" :key="scope.name">
          <div
            :class="[
              'flex items-start gap-3 rounded-2xl border bg-card/50 px-4 py-3 backdrop-blur-md',
              scopeLevelClass(scope.level),
            ]"
          >
            <span class="mt-1.5 size-2.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
            <div class="grid min-w-0 gap-0.5">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-medium text-foreground">{{ scope.label }}</p>
                <Badge
                  v-if="shouldShowScopeStatus(scope)"
                  variant="destructive"
                  class="text-[10px]"
                >
                  {{ scope.statusLabel }}
                </Badge>
              </div>
              <p class="text-xs leading-relaxed text-muted-foreground">
                {{ scope.description }}
              </p>
              <code class="font-mono text-[10px] text-muted-foreground">{{ scope.name }}</code>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <p
      class="w-full rounded-2xl border border-border bg-card/40 px-4 py-3 text-center text-xs leading-relaxed text-muted-foreground backdrop-blur-md"
    >
      {{ t('auth.consent.helper') }}
    </p>

    <!--
      DOM ORDER: Deny first, Allow second.
      ConsentPage.spec.ts depends on `wrapper.get('button')` returning Deny
      and `button:not([disabled]) + button` returning Allow.
    -->
    <div class="grid w-full gap-3 sm:grid-cols-2">
      <SsoGlassButton
        variant="ghost"
        size="lg"
        class="w-full"
        :disabled="!canDecide"
        :loading="submitting === 'deny'"
        @click="decide('deny')"
      >
        <template v-if="submitting !== 'deny'" #leading>
          <X class="size-4" aria-hidden="true" />
        </template>
        {{ submitting === 'deny' ? t('common.processing') : t('auth.consent.deny') }}
      </SsoGlassButton>

      <SsoGlassButton
        variant="vibrant"
        size="lg"
        class="w-full"
        :disabled="!canDecide"
        :loading="submitting === 'allow'"
        @click="decide('allow')"
      >
        <template v-if="submitting !== 'allow'" #leading>
          <Check class="size-4" aria-hidden="true" />
        </template>
        {{ submitting === 'allow' ? t('common.processing') : t('auth.consent.allow') }}
      </SsoGlassButton>
    </div>
  </section>
</template>
