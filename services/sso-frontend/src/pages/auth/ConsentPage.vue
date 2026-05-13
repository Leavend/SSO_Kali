<script setup lang="ts">
/**
 * ConsentPage — UC-13 (display scopes for user consent).
 *
 * Status: Display-only. Approve/Deny wired up in Phase-2 (requires backend
 * consent-decision endpoint). Today this page exists to show the user what
 * scopes an RP is requesting, with human-readable Indonesian labels.
 *
 * Expected query params (from SSO authorize redirect):
 *   - client_id: RP identifier to display to the user
 *   - scope: space-separated OIDC scope list
 *   - state: (optional) flow continuation token
 */

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ShieldAlert, ShieldCheck } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  hasUnknownScopes,
  resolveScopeList,
  type ScopeDescriptor,
} from '@/lib/oidc/scope-labels'

const route = useRoute()

const clientId = computed<string>(() => String(route.query['client_id'] ?? ''))

const scopes = computed<readonly ScopeDescriptor[]>(() => {
  const raw = route.query['scope']
  return resolveScopeList(typeof raw === 'string' ? raw : '')
})

const containsUnknown = computed<boolean>(() => hasUnknownScopes(scopes.value))

function scopeDotClass(level: ScopeDescriptor['level']): string {
  switch (level) {
    case 'unknown':
      return 'bg-destructive'
    case 'sensitive':
      return 'bg-amber-500'
    default:
      return 'bg-primary/60'
  }
}
</script>

<template>
  <section class="grid gap-6 max-w-md mx-auto">
    <Card>
      <CardHeader class="items-center text-center">
        <span class="bg-primary/10 text-primary grid size-12 place-items-center rounded-xl">
          <ShieldCheck class="size-6" />
        </span>
        <CardTitle>Otorisasi Aplikasi</CardTitle>
        <CardDescription>
          Aplikasi <strong>{{ clientId || 'Unknown' }}</strong> meminta akses ke akun SSO-mu.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <div
          v-if="containsUnknown"
          role="alert"
          class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
        >
          <ShieldAlert class="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Permintaan ini berisi scope yang tidak dikenal. Jangan menyetujui jika
            kamu tidak yakin aplikasi ini tepercaya.
          </p>
        </div>

        <div v-if="scopes.length > 0" class="grid gap-3">
          <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Izin yang diminta:
          </p>
          <ul class="grid gap-3">
            <li
              v-for="scope in scopes"
              :key="scope.name"
              class="flex items-start gap-3 rounded-md border p-3"
            >
              <span
                :class="['size-2.5 rounded-full mt-1.5 shrink-0', scopeDotClass(scope.level)]"
                aria-hidden="true"
              />
              <div class="grid gap-0.5">
                <p class="text-sm font-medium">{{ scope.label }}</p>
                <p class="text-muted-foreground text-xs">{{ scope.description }}</p>
                <code class="text-muted-foreground/80 text-[10px] font-mono">{{ scope.name }}</code>
              </div>
            </li>
          </ul>
        </div>

        <p class="text-muted-foreground text-xs text-center border rounded-md p-3 bg-muted/50">
          Persetujuan (Approve/Deny) akan tersedia di rilis berikutnya.
        </p>

        <div class="flex gap-3 justify-center">
          <Button variant="outline" disabled>Tolak</Button>
          <Button disabled>Izinkan</Button>
        </div>
      </CardContent>
    </Card>
  </section>
</template>
