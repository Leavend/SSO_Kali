<script setup lang="ts">
/**
 * TotpQrCode — FR-019 / UC-49.
 *
 * Renders QR code dari provisioning URI untuk authenticator apps.
 * Menampilkan juga manual entry key sebagai fallback.
 *
 * Level: Atom (props-driven, no side effects).
 */

import { computed } from 'vue'
import { Copy } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  provisioningUri: string
  secret: string
}>()

const qrImageUrl = computed<string>(() => {
  const encoded = encodeURIComponent(props.provisioningUri)
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&format=svg`
})

async function copySecret(): Promise<void> {
  await navigator.clipboard.writeText(props.secret)
}
</script>

<template>
  <div class="grid gap-4">
    <div class="flex justify-center">
      <div class="rounded-xl border bg-white p-3 shadow-sm dark:bg-zinc-900">
        <img
          :src="qrImageUrl"
          :alt="`QR Code untuk TOTP enrollment`"
          width="200"
          height="200"
          class="size-[200px]"
        />
      </div>
    </div>

    <div class="grid gap-2">
      <p class="text-muted-foreground text-center text-xs">
        Scan QR code di atas menggunakan authenticator app (Google Authenticator, Authy, dll).
      </p>

      <div class="grid gap-1.5">
        <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
          Atau masukkan kode manual:
        </span>
        <div class="flex items-center gap-2">
          <code class="bg-muted flex-1 rounded-md px-3 py-2 font-mono text-xs tracking-widest break-all">
            {{ secret }}
          </code>
          <Button
            variant="ghost"
            size="sm"
            class="shrink-0"
            aria-label="Salin kode secret"
            @click="copySecret"
          >
            <Copy class="size-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
