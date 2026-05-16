<script setup lang="ts">
import { onMounted } from 'vue'
import { Download, RefreshCw, ShieldCheck } from 'lucide-vue-next'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import SsoFormField from '@/components/molecules/SsoFormField.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminAuditTrail } from '@/composables/useAdminAuditTrail'
import { useAdminConsoleStore } from '@/stores/admin-console.store'

const audit = useAdminAuditTrail()
const admin = useAdminConsoleStore()

onMounted((): void => {
  void audit.load()
  void audit.checkIntegrity()
})
</script>

<template>
  <section class="grid gap-6" aria-labelledby="admin-audit-title">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="grid gap-2">
        <p class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Admin · Audit
        </p>
        <h1 id="admin-audit-title" class="text-2xl font-bold tracking-tight">
          Audit Trail & Integrity
        </h1>
        <p class="text-muted-foreground max-w-3xl text-sm leading-relaxed">
          Browse audit log paginated, filter event, cek hash-chain integrity, dan export hanya saat
          capability tersedia.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        class="min-h-11"
        :disabled="audit.loading.value"
        @click="audit.load"
      >
        <RefreshCw class="size-4" aria-hidden="true" />
        Muat ulang
      </Button>
    </header>

    <SsoAlertBanner v-if="audit.error.value" tone="error" :message="audit.error.value" />
    <SsoAlertBanner v-if="audit.success.value" tone="success" :message="audit.success.value" />
    <p v-if="audit.supportReference.value" class="text-muted-foreground text-xs">
      {{ audit.supportReference.value }}
    </p>

    <Card>
      <CardHeader>
        <CardTitle>Integrity Status</CardTitle>
        <CardDescription
          >Verifikasi rantai hash audit dilakukan manual, bukan polling otomatis.</CardDescription
        >
      </CardHeader>
      <CardContent class="flex flex-wrap items-center gap-3">
        <Badge :variant="audit.integrity.value?.valid ? 'secondary' : 'destructive'">
          {{ audit.integrity.value?.valid ? 'valid' : 'unknown / invalid' }}
        </Badge>
        <p class="text-muted-foreground text-sm">
          Checked: {{ audit.integrity.value?.checked_events ?? 0 }}
        </p>
        <p v-if="audit.integrity.value?.broken_event_id" class="text-error-700 text-sm">
          Broken event: {{ audit.integrity.value.broken_event_id }}
        </p>
        <Button type="button" variant="outline" class="min-h-11" @click="audit.checkIntegrity">
          <ShieldCheck class="size-4" />Cek ulang
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Filter Audit</CardTitle>
        <CardDescription
          >Filter dikirim sebagai query backend; nilai kosong tidak dikirim.</CardDescription
        >
      </CardHeader>
      <CardContent>
        <form class="grid gap-3 md:grid-cols-3" @submit.prevent="audit.load">
          <SsoFormField id="audit-action" v-model="audit.filters.action" label="Action" />
          <SsoFormField id="audit-taxonomy" v-model="audit.filters.taxonomy" label="Taxonomy" />
          <SsoFormField
            id="audit-admin"
            v-model="audit.filters.admin_subject_id"
            label="Admin subject"
          />
          <label class="grid gap-1.5 text-sm font-medium">
            Outcome
            <select
              v-model="audit.filters.outcome"
              class="border-input bg-background min-h-11 rounded-md border px-3"
            >
              <option value="">Semua</option>
              <option value="succeeded">succeeded</option>
              <option value="denied">denied</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <SsoFormField
            id="audit-from"
            v-model="audit.filters.from"
            label="From"
            placeholder="2026-05-01"
          />
          <SsoFormField
            id="audit-to"
            v-model="audit.filters.to"
            label="To"
            placeholder="2026-05-16"
          />
          <Button type="submit" class="min-h-11 md:col-span-3">Terapkan Filter</Button>
        </form>
      </CardContent>
    </Card>

    <Card v-if="admin.can('admin.audit.export')">
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <CardDescription>Export memakai route step-up backend dan field whitelist.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-2">
        <Button
          type="button"
          class="min-h-11"
          :disabled="audit.exporting.value"
          @click="audit.exportTrail('csv')"
        >
          <Download class="size-4" />Export CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          class="min-h-11"
          :disabled="audit.exporting.value"
          @click="audit.exportTrail('jsonl')"
        >
          <Download class="size-4" />Export JSONL
        </Button>
      </CardContent>
    </Card>

    <div class="grid gap-3">
      <Card v-for="event in audit.events.value" :key="event.event_id">
        <CardHeader>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <CardTitle class="break-words text-base">{{ event.action }}</CardTitle>
              <CardDescription class="break-all">{{ event.event_id }}</CardDescription>
            </div>
            <Badge :variant="event.outcome === 'failed' ? 'destructive' : 'outline'">{{
              event.outcome
            }}</Badge>
          </div>
        </CardHeader>
        <CardContent class="grid gap-2 text-sm sm:grid-cols-3">
          <p><span class="text-muted-foreground">Actor:</span> {{ event.actor.email }}</p>
          <p><span class="text-muted-foreground">Taxonomy:</span> {{ event.taxonomy }}</p>
          <p><span class="text-muted-foreground">At:</span> {{ event.occurred_at ?? 'n/a' }}</p>
          <p class="break-all sm:col-span-3">
            <span class="text-muted-foreground">Path:</span> {{ event.request.method }}
            {{ event.request.path }}
          </p>
        </CardContent>
      </Card>
    </div>

    <nav class="flex flex-wrap justify-between gap-2" aria-label="Audit pagination">
      <Button
        type="button"
        variant="outline"
        class="min-h-11"
        :disabled="!audit.pagination.value?.previous_cursor"
        @click="audit.previousPage"
        >Sebelumnya</Button
      >
      <Button
        type="button"
        variant="outline"
        class="min-h-11"
        :disabled="!audit.pagination.value?.next_cursor"
        @click="audit.nextPage"
      >
        Berikutnya
      </Button>
    </nav>
  </section>
</template>
