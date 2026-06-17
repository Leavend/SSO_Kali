<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'
import {
  AlertTriangle,
  Key,
  Settings,
} from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import { useAuditStore } from '@/features/audit/stores/audit.store'
import { formatTechnicalPreview } from '@/lib/display-identifiers'

const store = useAuditStore()
const { t } = useI18n()

const emit = defineEmits<{
  (e: 'open-auth-detail', id: string): void
}>()

const isAuthenticationEventsLoading = computed(
  () =>
    (store.status === 'idle' ||
      store.status === 'loading' ||
      store.sections.authEvents.status === 'loading') &&
    store.authenticationEvents.length === 0,
)
const showAuthenticationEventsEmpty = computed(
  () => !isAuthenticationEventsLoading.value && store.authenticationEvents.length === 0,
)

const authenticationEventColumns = [
  { key: 'event_id', label: 'Kode event' },
  { key: 'event_type', label: 'Event type' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'request_id', label: 'Kode request' },
] as const
const authenticationEventRows = computed<readonly UiDataListRow[]>(() =>
  store.authenticationEvents.map((event) => ({
    id: event.event_id,
    event_id: formatTechnicalPreview(event.event_id),
    event_type: event.event_type,
    outcome: event.outcome,
    request_id: formatTechnicalPreview(event.request?.request_id),
  })),
)

const loadingTableRows = Array.from({ length: 4 }, (_, index) => index)

function openAuthenticationEventDetail(eventId: string): void {
  emit('open-auth-detail', eventId)
}
</script>

<template>
  <div class="space-y-6">
    <section class="audit-events-section" aria-labelledby="security-evidence-title">
      <div class="ui-card space-y-4">
        <h2 id="security-evidence-title" class="text-base font-bold">
          {{ t('audit.security_evidence_title') }}
        </h2>
        <div class="audit-table-region">
          <p
            v-if="showAuthenticationEventsEmpty"
            class="audit-table-empty-state text-sm text-muted-foreground"
          >
            {{ t('audit.no_security_events') }}
          </p>
          <div v-else class="audit-table-wrapper audit-table-wrapper--mobile-priority">
            <div
              v-if="isAuthenticationEventsLoading"
              class="audit-table-skeleton"
              data-test="audit-loading-table-shell"
              role="presentation"
              aria-label="Authentication event table loading"
            >
              <div class="audit-table-skeleton__header">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div
                v-for="row in loadingTableRows"
                :key="`authentication-${row}`"
                class="audit-table-skeleton__row"
              >
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <UiDataList
              v-else
              caption="Authentication event table"
              :columns="authenticationEventColumns"
              :rows="authenticationEventRows"
            >
              <template #actions="{ row }">
                <UiButton
                  variant="secondary"
                  size="sm"
                  :class="
                    row.id === store.selectedAuthenticationEventId
                      ? 'border-primary text-primary'
                      : undefined
                  "
                  @click="openAuthenticationEventDetail(row.id)"
                >
                  {{ t('audit.btn_view_detail') }}
                </UiButton>
              </template>
            </UiDataList>
          </div>
        </div>
        <div class="pt-2">
          <UiButton
            v-if="
              store.authenticationEventPagination?.has_more &&
              store.authenticationEventPagination?.next_cursor
            "
            variant="primary"
            class="authentication-load-more-button"
            @click="store.loadMoreAuthenticationEvents"
          >
            {{ t('audit.btn_load_more_security') }}
          </UiButton>
        </div>
      </div>
    </section>

    <!-- Security Policy Cards Grid -->
    <div class="audit-grid audit-grid-2">
      <!-- Suspicious Login Challenge Card -->
      <section class="ui-card audit-card-premium space-y-3" aria-labelledby="challenge-title">
        <div class="flex items-center gap-2">
          <AlertTriangle class="size-5 text-amber-500" />
          <h3 id="challenge-title" class="text-base font-bold">
            {{ t('audit.challenge_title') }}
          </h3>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          {{ t('audit.risk_challenge_desc') }}
        </p>
      </section>

      <!-- ACR Permissive Policy Card -->
      <section class="ui-card audit-card-premium space-y-3" aria-labelledby="acr-title">
        <div class="flex items-center gap-2">
          <Key class="size-5 text-indigo-500" />
          <h3 id="acr-title" class="text-base font-bold">{{ t('audit.acr_title') }}</h3>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          {{ t('audit.acr_policy_desc') }}
        </p>
      </section>
    </div>

    <!-- Observable evidence title -->
    <div class="pt-4 border-t border-border">
      <h3 class="text-base font-bold mb-4 flex items-center gap-2 text-primary">
        <Settings class="size-5" />
        {{ t('audit.portal_evidence_title') }}
      </h3>
      <div class="audit-grid audit-grid-3">
        <!-- Consent revocation viewer -->
        <div class="ui-card audit-card-premium space-y-2">
          <h4 class="text-sm font-bold text-foreground">
            {{ t('audit.consent_revocation_title') }}
          </h4>
          <p class="text-xs text-muted-foreground leading-relaxed">
            {{ t('audit.consent_revocation_desc') }}
          </p>
        </div>
        <!-- Legacy session sunset -->
        <div class="ui-card audit-card-premium space-y-2">
          <h4 class="text-sm font-bold text-foreground">
            {{ t('audit.legacy_fallback_title') }}
          </h4>
          <p class="text-xs text-muted-foreground leading-relaxed">
            {{ t('audit.legacy_fallback_desc') }}
          </p>
        </div>
        <!-- Token lifetime production guard -->
        <div class="ui-card audit-card-premium space-y-2">
          <h4 class="text-sm font-bold text-foreground">
            {{ t('audit.token_lifetime_title') }}
          </h4>
          <p class="text-xs text-muted-foreground leading-relaxed">
            {{ t('audit.token_lifetime_desc') }}
          </p>
        </div>
        <!-- Session / logout evidence console -->
        <div class="ui-card audit-card-premium space-y-2">
          <h4 class="text-sm font-bold text-foreground">
            {{ t('audit.session_logout_title') }}
          </h4>
          <p class="text-xs text-muted-foreground leading-relaxed">
            {{ t('audit.session_logout_desc') }}
          </p>
        </div>
        <!-- Safe error regression review -->
        <div class="ui-card audit-card-premium space-y-2">
          <h4 class="text-sm font-bold text-foreground">{{ t('audit.safe_error_title') }}</h4>
          <p class="text-xs text-muted-foreground leading-relaxed">
            {{ t('audit.safe_error_desc') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
