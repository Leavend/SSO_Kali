<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Inbox, ShieldAlert, ScrollText, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import PortalPageHeader from '@/components/molecules/PortalPageHeader.vue'
import { useDataSubjectRequests } from '@/composables/useDataSubjectRequests'
import { formatPrivacyTimestamp } from '@/lib/privacy-format'
import {
  dataSubjectStatusBadgeVariant,
  dataSubjectStatusLabel,
  dataSubjectTypeBadgeVariant,
  dataSubjectTypeLabel,
  privacyRequestOption,
  PRIVACY_REQUEST_TYPE_OPTIONS,
} from '@/lib/privacy-requests'
import { cn } from '@/lib/utils'
import { useI18n } from '@/composables/useI18n'
import type { Component } from 'vue'
import type { DataSubjectRequestType } from '@/types/profile.types'

const privacy = useDataSubjectRequests()
const isConfirmOpen = ref(false)
const { t } = useI18n()

const selectedOption = computed(() => privacyRequestOption(privacy.form.type))
const submitLabel = computed<string>(() =>
  privacy.submitting.value
    ? t(selectedOption.value.pendingLabelKey)
    : t(selectedOption.value.ctaLabelKey),
)

function requestIcon(type: DataSubjectRequestType): Component {
  if (type === 'delete') return Trash2
  if (type === 'anonymize') return ShieldAlert
  return Download
}

function selectRequestType(type: DataSubjectRequestType): void {
  privacy.setType(type)
}

function handleSubmit(): void {
  if (!privacy.canSubmit.value) return
  if (selectedOption.value.requiresConfirmation) {
    isConfirmOpen.value = true
    return
  }
  void privacy.submitConfirmed()
}

function handleConfirmSubmit(): void {
  void privacy.submitConfirmed()
}
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      :eyebrow="t('portal.privacy.eyebrow')"
      :title="t('portal.privacy.title')"
      :description="t('portal.privacy.description')"
      :icon="ScrollText"
    />

    <Card>
      <CardHeader>
        <CardTitle>{{ t('portal.privacy.new_request') }}</CardTitle>
        <CardDescription>
          {{ t('portal.privacy.request_helper') }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-5" novalidate @submit.prevent="handleSubmit">
          <div class="grid gap-3 md:grid-cols-3">
            <button
              v-for="item in PRIVACY_REQUEST_TYPE_OPTIONS"
              :key="item.type"
              :data-testid="`privacy-type-${item.type}`"
              type="button"
              :aria-pressed="privacy.form.type === item.type"
              :class="
                cn(
                  'rounded-[var(--radius-glass-xl)] border bg-[var(--glass-bg-primary)] p-4 text-left shadow-[var(--shadow-glass-sm)] backdrop-blur-[var(--glass-blur-sm)] transition hover:-translate-y-0.5 hover:bg-[var(--glass-bg-elevated)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                  item.cardClass,
                  privacy.form.type === item.type
                    ? item.selectedClass
                    : 'border-[var(--glass-border-subtle)]',
                )
              "
              @click="selectRequestType(item.type)"
            >
              <component
                :is="requestIcon(item.type)"
                :class="cn('mb-3 size-5', item.iconClass)"
                aria-hidden="true"
              />
              <span class="block text-sm font-semibold">{{ t(item.titleKey) }}</span>
              <span class="text-muted-foreground mt-1 block text-xs leading-relaxed">
                {{ t(item.descriptionKey) }}
              </span>
              <span class="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" :class="cn('rounded-full', item.riskBadgeClass)">
                  {{ t(item.riskLabelKey) }}
                </Badge>
                <span class="text-muted-foreground text-xs">{{ t(item.riskDescriptionKey) }}</span>
              </span>
            </button>
          </div>

          <div class="grid gap-2">
            <Label for="privacy-reason">{{ t('portal.privacy.reason_label') }}</Label>
            <Input
              id="privacy-reason"
              :model-value="privacy.form.reason"
              type="text"
              maxlength="500"
              :placeholder="t('portal.privacy.reason_placeholder')"
              :disabled="privacy.submitting.value"
              @update:model-value="privacy.form.reason = String($event)"
            />
          </div>

          <SsoAlertBanner v-if="privacy.error.value" tone="error" :message="privacy.error.value" />
          <p v-if="privacy.supportReferenceText.value" class="text-muted-foreground text-xs">
            {{ privacy.supportReferenceText.value }}
          </p>
          <SsoAlertBanner
            v-if="privacy.success.value"
            tone="success"
            :message="privacy.success.value"
          />

          <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              data-testid="privacy-submit-button"
              type="submit"
              :variant="selectedOption.buttonVariant"
              :disabled="!privacy.canSubmit.value"
              :class="cn('w-full sm:w-fit', selectedOption.buttonClass)"
            >
              {{ submitLabel }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ t('portal.privacy.status_title') }}</CardTitle>
        <CardDescription>
          {{ t('portal.privacy.status_helper') }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="privacy.pending.value" class="grid gap-3">
          <Skeleton v-for="i in 3" :key="i" class="h-20 rounded-xl" />
        </div>
        <div
          v-else-if="privacy.requests.value.length === 0"
          data-testid="privacy-empty-state"
          class="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm"
        >
          <Inbox class="text-muted-foreground/50 size-8" aria-hidden="true" />
          {{ t('portal.privacy.empty_requests') }}
        </div>
        <ul v-else class="grid gap-3">
          <li
            v-for="request in privacy.requests.value"
            :key="request.request_id"
            class="grid gap-3 rounded-[var(--radius-glass-xl)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-primary)] p-4 shadow-[var(--shadow-glass-sm)] backdrop-blur-[var(--glass-blur-sm)] sm:grid-cols-[1fr_auto] sm:items-start"
          >
            <div class="grid gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <Badge
                  data-testid="privacy-request-type-badge"
                  :variant="dataSubjectTypeBadgeVariant(request.type)"
                  class="rounded-md"
                >
                  {{ dataSubjectTypeLabel(request.type) }}
                </Badge>
                <Badge
                  data-testid="privacy-request-status-badge"
                  :variant="dataSubjectStatusBadgeVariant(request.status)"
                  class="rounded-full"
                >
                  {{ dataSubjectStatusLabel(request.status) }}
                </Badge>
              </div>
              <p class="text-sm font-medium">{{ request.reason || t('portal.privacy.reason_fallback') }}</p>
              <p class="text-muted-foreground text-xs">
                {{ t('portal.privacy.submitted_at', { date: formatPrivacyTimestamp(request.submitted_at, t('portal.privacy.submitted_not_available')) }) }}
              </p>
            </div>
            <div class="text-muted-foreground text-xs sm:text-right">
              <p>{{ t('portal.privacy.sla_due', { date: formatPrivacyTimestamp(request.sla_due_at, t('portal.privacy.sla_not_available')) }) }}</p>
              <p>{{ t('portal.privacy.fulfilled_at', { date: formatPrivacyTimestamp(request.fulfilled_at) }) }}</p>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>

    <ConfirmDialog
      v-model:open="isConfirmOpen"
      :title="selectedOption.confirmTitleKey ? t(selectedOption.confirmTitleKey) : ''"
      :description="selectedOption.confirmDescriptionKey ? t(selectedOption.confirmDescriptionKey) : ''"
      :confirm-label="selectedOption.confirmLabelKey ? t(selectedOption.confirmLabelKey) : ''"
      :cancel-label="t('portal.privacy.check_again')"
      destructive
      @confirm="handleConfirmSubmit"
    />
  </section>
</template>
