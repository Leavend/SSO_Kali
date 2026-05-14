<script setup lang="ts">
/**
 * RecoveryCodesStatus — FR-020 / UC-69.
 *
 * Menampilkan jumlah recovery codes tersisa dengan visual indicator
 * dan tombol regenerasi. Warning ditampilkan jika sisa ≤ 2.
 *
 * Level: Molecule (menggunakan atoms: Badge, Button, Card, Alert).
 */

import { computed } from 'vue'
import { KeyRound, RefreshCw, AlertTriangle } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const props = defineProps<{
  remaining: number
  pending: boolean
}>()

const emit = defineEmits<{
  regenerate: []
}>()

const statusVariant = computed<'default' | 'secondary' | 'destructive'>(() => {
  if (props.remaining <= 2) return 'destructive'
  if (props.remaining <= 4) return 'secondary'
  return 'default'
})

const statusLabel = computed<string>(() => {
  if (props.remaining === 0) return 'Habis'
  return `${props.remaining} tersisa`
})

const indicatorClass = computed<string>(() => {
  if (props.remaining <= 2) return 'bg-red-500/10 text-red-600 dark:text-red-400'
  if (props.remaining <= 4) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  return 'bg-green-500/10 text-green-600 dark:text-green-400'
})
</script>

<template>
  <Card class="relative overflow-hidden">
    <CardHeader class="flex flex-row items-start gap-3 space-y-0">
      <span
        class="grid size-10 shrink-0 place-items-center rounded-lg"
        :class="indicatorClass"
      >
        <KeyRound class="size-5" />
      </span>
      <div class="grid gap-1">
        <CardTitle class="text-sm font-semibold">Recovery Codes</CardTitle>
        <CardDescription class="flex items-center gap-2">
          <Badge :variant="statusVariant" class="text-[10px]">
            {{ statusLabel }}
          </Badge>
        </CardDescription>
      </div>
    </CardHeader>
    <CardContent class="grid gap-3">
      <!-- Warning banner -->
      <div
        v-if="remaining <= 2"
        class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950"
        role="alert"
        aria-live="polite"
      >
        <AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
        <p class="text-xs text-red-800 dark:text-red-200">
          <template v-if="remaining === 0">
            Semua recovery codes sudah digunakan. Regenerasi segera untuk menjaga akses akun.
          </template>
          <template v-else>
            Sisa recovery codes sangat sedikit. Regenerasi kode baru untuk keamanan akun.
          </template>
        </p>
      </div>

      <p class="text-muted-foreground text-xs">
        Recovery codes digunakan sebagai cadangan jika kamu kehilangan akses ke authenticator app.
      </p>

      <Button
        size="sm"
        variant="outline"
        class="w-fit"
        :disabled="pending"
        @click="emit('regenerate')"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': pending }" />
        Regenerasi Recovery Codes
      </Button>
    </CardContent>
  </Card>
</template>
