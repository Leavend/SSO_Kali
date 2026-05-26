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
import type { Component } from 'vue'
import type { DataSubjectRequestType } from '@/types/profile.types'

const privacy = useDataSubjectRequests()
const isConfirmOpen = ref(false)

const selectedOption = computed(() => privacyRequestOption(privacy.form.type))
const submitLabel = computed<string>(() =>
  privacy.submitting.value ? selectedOption.value.pendingLabel : selectedOption.value.ctaLabel,
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
      eyebrow="Privacy Center"
      title="Privasi & Data"
      description="Ajukan permintaan ekspor, penghapusan, atau anonimisasi data pribadi dengan tenggat peninjauan 30 hari dan status yang bisa kamu pantau."
      :icon="ScrollText"
    />

    <Card>
      <CardHeader>
        <CardTitle>Permintaan Baru</CardTitle>
        <CardDescription>
          Permintaan akan diproses dalam 30 hari (tenggat dihitung saat dikirim). Permintaan
          penghapusan atau anonimisasi diproses hanya setelah diverifikasi.
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
              <span class="block text-sm font-semibold">{{ item.title }}</span>
              <span class="text-muted-foreground mt-1 block text-xs leading-relaxed">
                {{ item.description }}
              </span>
              <span class="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" :class="cn('rounded-full', item.riskBadgeClass)">
                  {{ item.riskLabel }}
                </Badge>
                <span class="text-muted-foreground text-xs">{{ item.riskDescription }}</span>
              </span>
            </button>
          </div>

          <div class="grid gap-2">
            <Label for="privacy-reason">Konteks tambahan (opsional)</Label>
            <Input
              id="privacy-reason"
              :model-value="privacy.form.reason"
              type="text"
              maxlength="500"
              placeholder="Contoh: diperlukan untuk keperluan audit akun internal"
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
        <CardTitle>Status Permintaan</CardTitle>
        <CardDescription>
          Pantau status dan tenggat waktu penyelesaian permintaan kamu.
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
          Belum ada permintaan yang diajukan. Gunakan form di atas untuk memulai.
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
              <p class="text-sm font-medium">{{ request.reason || 'Tanpa konteks tambahan.' }}</p>
              <p class="text-muted-foreground text-xs">
                Diajukan: {{ formatPrivacyTimestamp(request.submitted_at, 'Belum diajukan') }}
              </p>
            </div>
            <div class="text-muted-foreground text-xs sm:text-right">
              <p>SLA: {{ formatPrivacyTimestamp(request.sla_due_at, 'Belum tersedia') }}</p>
              <p>Selesai: {{ formatPrivacyTimestamp(request.fulfilled_at) }}</p>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>

    <ConfirmDialog
      v-model:open="isConfirmOpen"
      :title="selectedOption.confirmTitle"
      :description="selectedOption.confirmDescription"
      :confirm-label="selectedOption.confirmLabel"
      cancel-label="Periksa Lagi"
      destructive
      @confirm="handleConfirmSubmit"
    />
  </section>
</template>
