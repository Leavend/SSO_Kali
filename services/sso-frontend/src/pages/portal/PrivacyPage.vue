<script setup lang="ts">
import { Download, ShieldAlert, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useDataSubjectRequests } from '@/composables/useDataSubjectRequests'
import type { DataSubjectRequestSummary, DataSubjectRequestType } from '@/types/profile.types'

const privacy = useDataSubjectRequests()

const requestTypes: ReadonlyArray<{
  readonly type: DataSubjectRequestType
  readonly title: string
  readonly description: string
}> = [
  {
    type: 'export',
    title: 'Ekspor data',
    description: 'Minta salinan data akun SSO dan riwayat yang boleh dibagikan.',
  },
  {
    type: 'delete',
    title: 'Hapus data',
    description: 'Ajukan penghapusan data akun sesuai kebijakan retensi legal.',
  },
  {
    type: 'anonymize',
    title: 'Anonimkan data',
    description: 'Ajukan anonimisasi identitas pada data historis yang masih wajib disimpan.',
  },
]

function typeLabel(type: DataSubjectRequestType): string {
  if (type === 'delete') return 'Hapus'
  if (type === 'anonymize') return 'Anonimkan'
  return 'Ekspor'
}

function statusLabel(status: DataSubjectRequestSummary['status']): string {
  if (status === 'approved') return 'Disetujui'
  if (status === 'rejected') return 'Ditolak'
  if (status === 'fulfilled') return 'Selesai'
  return 'Diajukan'
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function iconFor(type: DataSubjectRequestType): typeof Download {
  if (type === 'delete') return Trash2
  if (type === 'anonymize') return ShieldAlert
  return Download
}
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Privasi & Data</h1>
      <p class="text-muted-foreground text-sm">
        Ajukan permintaan ekspor, penghapusan, atau anonimisasi data pribadi secara aman.
      </p>
    </header>

    <Card>
      <CardHeader>
        <CardTitle>Permintaan Baru</CardTitle>
        <CardDescription>
          SLA peninjauan maksimal 30 hari. Permintaan tidak langsung menghapus data sampai diverifikasi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-5" novalidate @submit.prevent="privacy.submit">
          <div class="grid gap-3 sm:grid-cols-3">
            <button
              v-for="item in requestTypes"
              :key="item.type"
              type="button"
              class="rounded-xl border p-4 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :class="privacy.form.type === item.type ? 'border-primary bg-primary/5' : 'border-border'"
              @click="privacy.setType(item.type)"
            >
              <component :is="iconFor(item.type)" class="text-primary mb-3 size-5" aria-hidden="true" />
              <span class="block text-sm font-semibold">{{ item.title }}</span>
              <span class="text-muted-foreground mt-1 block text-xs leading-relaxed">{{ item.description }}</span>
            </button>
          </div>

          <div class="grid gap-2">
            <Label for="privacy-reason">Alasan / konteks opsional</Label>
            <Input
              id="privacy-reason"
              :model-value="privacy.form.reason"
              @update:model-value="privacy.form.reason = String($event)"
              type="text"
              maxlength="500"
              placeholder="Contoh: butuh ekspor data untuk audit pribadi"
              :disabled="privacy.submitting.value"
            />
          </div>

          <SsoAlertBanner v-if="privacy.error.value" tone="error" :message="privacy.error.value" />
          <p v-if="privacy.supportReferenceText.value" class="text-muted-foreground text-xs">
            {{ privacy.supportReferenceText.value }}
          </p>
          <SsoAlertBanner v-if="privacy.success.value" tone="success" :message="privacy.success.value" />

          <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="submit" :disabled="!privacy.canSubmit.value" class="w-full sm:w-fit">
              {{ privacy.submitting.value ? 'Mengirim…' : 'Kirim Permintaan' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Status Permintaan</CardTitle>
        <CardDescription>Lacak status permintaan dan batas SLA.</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="privacy.pending.value" class="grid gap-3">
          <Skeleton v-for="i in 3" :key="i" class="h-20 rounded-xl" />
        </div>
        <p v-else-if="privacy.requests.value.length === 0" class="text-muted-foreground text-sm">
          Belum ada permintaan privasi.
        </p>
        <ul v-else class="grid gap-3">
          <li
            v-for="request in privacy.requests.value"
            :key="request.request_id"
            class="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto] sm:items-start"
          >
            <div class="grid gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{{ typeLabel(request.type) }}</Badge>
                <Badge variant="outline">{{ statusLabel(request.status) }}</Badge>
              </div>
              <p class="text-sm font-medium">{{ request.reason || 'Tanpa alasan tambahan.' }}</p>
              <p class="text-muted-foreground text-xs">Diajukan: {{ formatDate(request.submitted_at) }}</p>
            </div>
            <div class="text-muted-foreground text-xs sm:text-right">
              <p>SLA: {{ formatDate(request.sla_due_at) }}</p>
              <p>Selesai: {{ formatDate(request.fulfilled_at) }}</p>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  </section>
</template>
