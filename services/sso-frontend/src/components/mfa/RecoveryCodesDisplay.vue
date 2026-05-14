<script setup lang="ts">
/**
 * RecoveryCodesDisplay — FR-019 / UC-51.
 *
 * Menampilkan recovery codes dalam grid monospace
 * dengan opsi salin dan unduh.
 *
 * Level: Molecule (menggunakan atoms: Button).
 */

import { Copy, Download, AlertTriangle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  codes: readonly string[]
}>()

const emit = defineEmits<{
  acknowledged: []
}>()

async function copyAll(): Promise<void> {
  const text = props.codes.join('\n')
  await navigator.clipboard.writeText(text)
}

function downloadCodes(): void {
  const text = [
    '# SSO Recovery Codes',
    '# Simpan file ini di tempat yang aman.',
    '# Setiap kode hanya bisa digunakan satu kali.',
    '',
    ...props.codes,
  ].join('\n')

  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'sso-recovery-codes.txt'
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="grid gap-4">
    <div class="grid gap-2 text-center">
      <h3 class="text-sm font-semibold">Recovery Codes</h3>
      <p class="text-muted-foreground text-xs">
        Simpan kode-kode ini di tempat yang aman. Kamu bisa menggunakannya untuk login jika kehilangan akses ke authenticator app.
      </p>
    </div>

    <!-- Warning -->
    <div
      class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950"
      role="alert"
    >
      <AlertTriangle class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p class="text-xs text-amber-800 dark:text-amber-200">
        Kode ini <strong>tidak akan ditampilkan lagi</strong>. Pastikan kamu sudah menyimpannya sebelum melanjutkan.
      </p>
    </div>

    <!-- Codes Grid -->
    <div class="grid grid-cols-2 gap-2 rounded-lg border bg-muted/50 p-3">
      <code
        v-for="(code, index) in codes"
        :key="index"
        class="rounded-md bg-background px-2.5 py-1.5 text-center font-mono text-xs tracking-wider shadow-sm"
      >
        {{ code }}
      </code>
    </div>

    <!-- Actions -->
    <div class="flex flex-wrap justify-center gap-2">
      <Button variant="outline" size="sm" @click="copyAll">
        <Copy class="size-4" />
        Salin Semua
      </Button>
      <Button variant="outline" size="sm" @click="downloadCodes">
        <Download class="size-4" />
        Unduh
      </Button>
    </div>

    <Button size="sm" class="w-full" @click="emit('acknowledged')">
      Saya sudah menyimpan kode ini
    </Button>
  </div>
</template>
