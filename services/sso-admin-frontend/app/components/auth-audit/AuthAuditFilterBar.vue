<!-- app/components/auth-audit/AuthAuditFilterBar.vue -->
<script setup lang="ts">
import { computed, reactive } from 'vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { AuthAuditFilters } from '@/types/auth-audit.types'

export type AuthAuditFilterLabels = {
  readonly title: string
  readonly outcome: string
  readonly outcomeAll: string
  readonly outcomeSucceeded: string
  readonly outcomeFailed: string
  readonly outcomeStarted: string
  readonly eventType: string
  readonly subjectId: string
  readonly from: string
  readonly to: string
  readonly filter: string
  readonly reset: string
}

const props = defineProps<{
  readonly labels: AuthAuditFilterLabels
  readonly submitting?: boolean
}>()

// UiSelect renders its own <option>s from an :options prop (it has no default
// slot), v-modelling a string. Build the outcome options from the labels.
const outcomeOptions = computed<readonly UiSelectOption[]>(() => [
  { value: '', label: props.labels.outcomeAll },
  { value: 'succeeded', label: props.labels.outcomeSucceeded },
  { value: 'failed', label: props.labels.outcomeFailed },
  { value: 'started', label: props.labels.outcomeStarted },
])

const emit = defineEmits<{
  (event: 'search', filters: AuthAuditFilters): void
  (event: 'reset'): void
}>()

const draft = reactive({
  outcome: '',
  event_type: '',
  subject_id: '',
  from: '',
  to: '',
})

function onSubmit(): void {
  emit('search', {
    outcome: draft.outcome,
    event_type: draft.event_type,
    subject_id: draft.subject_id,
    from: draft.from,
    to: draft.to,
  })
}

function onReset(): void {
  draft.outcome = ''
  draft.event_type = ''
  draft.subject_id = ''
  draft.from = ''
  draft.to = ''
  emit('reset')
}
</script>

<template>
  <form
    class="auth-audit-filter"
    data-testid="auth-audit-filter-form"
    aria-label="filter"
    @submit.prevent="onSubmit"
  >
    <p class="auth-audit-filter__title">{{ labels.title }}</p>
    <div class="auth-audit-filter__grid">
      <label class="auth-audit-filter__field">
        <span>{{ labels.outcome }}</span>
        <UiSelect
          v-model="draft.outcome"
          :options="outcomeOptions"
          data-testid="auth-audit-filter-outcome"
        />
      </label>

      <label class="auth-audit-filter__field">
        <span>{{ labels.eventType }}</span>
        <UiInput v-model="draft.event_type" data-testid="auth-audit-filter-event-type" />
      </label>

      <label class="auth-audit-filter__field">
        <span>{{ labels.subjectId }}</span>
        <UiInput v-model="draft.subject_id" data-testid="auth-audit-filter-subject-id" />
      </label>

      <label class="auth-audit-filter__field">
        <span>{{ labels.from }}</span>
        <UiInput v-model="draft.from" type="date" data-testid="auth-audit-filter-from" />
      </label>

      <label class="auth-audit-filter__field">
        <span>{{ labels.to }}</span>
        <UiInput v-model="draft.to" type="date" data-testid="auth-audit-filter-to" />
      </label>
    </div>

    <div class="auth-audit-filter__actions">
      <UiButton type="submit" variant="primary" size="sm" :disabled="submitting" data-testid="auth-audit-filter-submit">
        {{ labels.filter }}
      </UiButton>
      <UiButton type="button" variant="secondary" size="sm" data-testid="auth-audit-filter-reset" @click="onReset">
        {{ labels.reset }}
      </UiButton>
    </div>
  </form>
</template>

<style scoped>
.auth-audit-filter {
  display: grid;
  gap: 12px;
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
}
.auth-audit-filter__title {
  margin: 0;
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.auth-audit-filter__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.auth-audit-filter__field {
  display: grid;
  gap: 4px;
  font: 600 0.75rem/1.3 var(--font-sans);
  color: var(--fg-2);
}
.auth-audit-filter__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
