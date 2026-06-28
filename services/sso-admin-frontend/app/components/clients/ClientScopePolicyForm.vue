<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminClientDetail, ScopeCatalogEntry, SyncScopesPayload } from '@/types/clients.types'
import { mergeAvailableScopes, scopeParityWarnings } from '@/lib/clients/client-create-form'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { formatSupportReference } from '@/lib/display-identifiers'
import UiButton from '@/components/ui/UiButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'

const FORCED_SCOPE = 'openid'

const props = defineProps<{ client: AdminClientDetail; catalog: readonly ScopeCatalogEntry[] }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()

const canWrite = computed(() => session.hasPermission('admin.clients.write'))

const clientScopes = computed(() => props.client.allowed_scopes ?? [])
const available = computed(() => mergeAvailableScopes(props.catalog, clientScopes.value))
const warnings = computed(() => scopeParityWarnings(props.catalog, clientScopes.value))

const selected = ref<readonly string[]>([])
function resetSelected(): void {
  const base = new Set(clientScopes.value)
  base.add(FORCED_SCOPE)
  selected.value = [...base]
}
resetSelected()
watch(() => props.client.client_id, resetSelected)

function isChecked(scope: string): boolean {
  return scope === FORCED_SCOPE || selected.value.includes(scope)
}
function toggle(scope: string, on: boolean): void {
  if (scope === FORCED_SCOPE) return
  const set = new Set(selected.value)
  if (on) set.add(scope)
  else set.delete(scope)
  set.add(FORCED_SCOPE)
  selected.value = [...set]
}

const failureRef = computed(() => formatSupportReference(action.requestId.value))

function buildPayload(): SyncScopesPayload {
  const set = new Set(selected.value)
  set.add(FORCED_SCOPE)
  return { scopes: [...set] }
}

async function submit(): Promise<void> {
  const result = await action.run(() =>
    clientsApi.syncScopes(props.client.client_id, buildPayload()),
  )
  if (result === null) return
  emit('done')
}
</script>

<template>
  <form
    v-if="canWrite"
    class="client-form"
    data-testid="client-scope-policy-form"
    @submit.prevent="submit"
  >
    <h3 class="client-form__title">{{ t('clients.scope_policy_title') }}</h3>

    <p
      v-if="warnings.length"
      data-testid="scope-parity-warning"
      class="client-form__warning"
      role="alert"
    >
      {{ t('clients.scope_parity_warning') }} {{ warnings.join(', ') }}
    </p>

    <div class="client-form__grid" role="group" :aria-label="t('clients.allowed_scopes_title')">
      <UiSwitch
        v-for="scope in available"
        :key="scope"
        :label="scope"
        :model-value="isChecked(scope)"
        :disabled="scope === 'openid'"
        @update:model-value="toggle(scope, $event)"
      />
    </div>

    <div
      v-if="action.failure.value"
      data-testid="scope-policy-error"
      class="client-form__error"
      role="alert"
    >
      <p>{{ t('common.error_generic') }}</p>
      <a
        v-if="action.stepUpUrl.value"
        :href="action.stepUpUrl.value"
        data-testid="scope-policy-stepup-link"
        class="client-form__stepup"
        >{{ t('clients.btn_step_up') }}</a
      >
      <p v-if="failureRef" class="client-form__ref">{{ failureRef }}</p>
    </div>

    <UiButton type="submit" :disabled="action.isSubmitting.value">
      {{ t('clients.btn_save_scope_policy') }}
    </UiButton>
  </form>
</template>

<style scoped>
.client-form {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-form__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.client-form__warning {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.client-form__grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.client-form__error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--danger);
  border-radius: var(--r-sm);
}
.client-form__error p {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.client-form__stepup {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
}
.client-form__ref {
  font-family: var(--font-mono);
  color: var(--fg-3);
}
</style>
