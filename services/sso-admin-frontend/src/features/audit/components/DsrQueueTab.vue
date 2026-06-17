<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { UserX } from 'lucide-vue-next'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useSessionStore } from '@/stores/session.store'
import { useAuditStore } from '@/features/audit/stores/audit.store'
import { formatTechnicalPreview } from '@/lib/display-identifiers'

const store = useAuditStore()
const session = useSessionStore()
const { t } = useI18n()

const canReviewDsr = computed(() => session.hasPermission('admin.dsr.review'))
const reviewNotes = ref('Evidence verified')
</script>

<template>
  <div class="space-y-6">
    <section class="ui-card space-y-6" aria-labelledby="dsr-title">
      <div class="flex items-center gap-3">
        <UserX class="size-5 text-primary" />
        <div>
          <h2 id="dsr-title" class="text-lg font-bold">{{ t('audit.dsr_title') }}</h2>
          <p class="text-sm text-muted-foreground">
            Manage and audit Data Subject Requests (DSR) under compliance laws.
          </p>
        </div>
      </div>

      <!-- Notes Field -->
      <div class="max-w-md" v-if="canReviewDsr">
        <UiFormField id="dsr-review-notes" :label="t('audit.review_notes')">
          <UiInput
            id="dsr-review-notes"
            name="dsr-review-notes"
            v-model="reviewNotes"
            autocomplete="off"
          />
        </UiFormField>
      </div>

      <!-- Requests List -->
      <div class="audit-grid audit-grid-2 pt-2">
        <div
          v-for="request in store.dataSubjectRequests"
          :key="request.request_id"
          class="bg-muted p-5 rounded-xl border border-border space-y-4 audit-card-premium"
        >
          <div
            class="flex justify-between items-center flex-wrap gap-2 border-b border-border pb-2"
          >
            <strong class="text-sm font-bold text-foreground break-anywhere">{{
              formatTechnicalPreview(request.request_id)
            }}</strong>
            <span class="audit-badge audit-badge--info">
              {{ request.type }}
            </span>
          </div>
          <div class="space-y-2 text-xs font-semibold">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Status:</span>
              <span class="text-foreground capitalize">{{ request.status }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Kode akun:</span>
              <span class="text-foreground font-mono break-anywhere">{{
                formatTechnicalPreview(request.subject_id)
              }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">{{ t('audit.sla_due') }}:</span>
              <span class="text-foreground font-mono">{{
                request.sla_due_at ?? 'No SLA evidence'
              }}</span>
            </div>
          </div>

          <div
            v-if="canReviewDsr"
            class="flex flex-wrap gap-2 pt-2 border-t border-border/50"
          >
            <UiButton
              variant="primary"
              size="sm"
              @click="store.reviewRequest(request.request_id, 'approved', reviewNotes)"
            >
              {{ t('audit.approve') }}
            </UiButton>
            <UiButton
              variant="danger"
              size="sm"
              @click="store.reviewRequest(request.request_id, 'rejected', reviewNotes)"
            >
              {{ t('audit.reject') }}
            </UiButton>
            <UiButton
              variant="secondary"
              size="sm"
              @click="store.fulfillRequest(request.request_id, true)"
            >
              {{ t('audit.dry_run_fulfill') }}
            </UiButton>
          </div>
        </div>
      </div>

      <p
        v-if="store.dataSubjectRequests.length === 0"
        class="text-sm text-muted-foreground italic"
      >
        {{ t('audit.no_dsr') }}
      </p>
    </section>
  </div>
</template>
