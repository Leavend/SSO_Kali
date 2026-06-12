<script setup lang="ts">
/**
 * SecurityAccessCard — peran, izin, dan cakupan akses sebagai chip konsisten.
 */

import { computed } from 'vue'
import { Info } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { permissionDescription } from '@/lib/portal-security'
import { resolveScopeList } from '@/lib/oidc/scope-labels'
import type { ScopeDescriptor } from '@/lib/oidc/scope-labels'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
interface Props {
  roles: readonly string[]
  permissions: readonly string[]
  scopes: readonly string[]
}

const props = defineProps<Props>()
const resolvedScopes = computed<readonly ScopeDescriptor[]>(() => resolveScopeList(props.scopes))

function scopeVariant(level: ScopeDescriptor['level']): 'secondary' | 'outline' {
  if (level === 'sensitive') return 'secondary'
  return 'outline'
}

function isUnverifiedScope(level: ScopeDescriptor['level']): boolean {
  return level === 'unknown' || level === 'unverified'
}

function tooltipKey(prefix: string, value: string): string {
  return `${prefix}-${value.replaceAll(/[^a-zA-Z0-9]+/g, '-')}`.replace(/-$/g, '')
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-base font-semibold">{{ t('portal.access.title') }}</CardTitle>
      <CardDescription>{{ t('portal.access.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="grid min-w-0 gap-4 lg:grid-cols-3">
      <div class="grid min-w-0 gap-1.5">
        <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider"
          >{{ t('portal.access.roles') }}</span
        >
        <div class="flex min-w-0 flex-wrap gap-1.5">
          <Badge v-for="role in props.roles" :key="role" variant="default" class="max-w-full text-xs">
            {{ role }}
          </Badge>
          <span v-if="props.roles.length === 0" class="text-muted-foreground text-xs italic">
            {{ t('portal.access.no_roles') }}
          </span>
        </div>
      </div>
      <div class="grid min-w-0 gap-1.5">
        <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider"
          >{{ t('portal.access.permissions') }}</span
        >
        <div class="grid min-w-0 gap-2">
          <div
            v-for="permission in props.permissions"
            :key="permission"
            data-testid="permission-access-item"
            class="group relative min-w-0"
          >
            <div data-testid="access-item-main" class="flex min-w-0 items-center gap-1.5">
              <Badge variant="secondary" class="max-w-full text-xs font-mono break-all">{{ permission }}</Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                :data-testid="tooltipKey('permission-info', permission)"
                class="text-muted-foreground size-6 shrink-0 rounded-full hover:text-foreground"
                :aria-label="
                  t('portal.access.permission_info', {
                    permission,
                    description: permissionDescription(permission),
                  })
                "
                :aria-describedby="tooltipKey('permission-tooltip', permission)"
              >
                <Info class="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <span
              :id="tooltipKey('permission-tooltip', permission)"
              data-testid="access-info-tooltip"
              role="tooltip"
              class="bg-popover text-popover-foreground pointer-events-none invisible absolute top-full left-0 z-20 mt-2 w-64 rounded-xl border px-3 py-2 text-xs leading-relaxed opacity-0 shadow-[var(--shadow-glass-sm)] transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
            >
              {{ permissionDescription(permission) }}
            </span>
          </div>
          <span v-if="props.permissions.length === 0" class="text-muted-foreground text-xs italic">
            {{ t('portal.access.no_permissions') }}
          </span>
        </div>
      </div>
      <div class="grid min-w-0 gap-1.5">
        <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider"
          >{{ t('portal.access.scopes') }}</span
        >
        <div class="grid min-w-0 gap-2">
          <div
            v-for="scope in resolvedScopes"
            :key="scope.name"
            data-testid="scope-access-item"
            class="group relative min-w-0"
          >
            <div data-testid="access-item-main" class="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge :variant="scopeVariant(scope.level)" class="text-xs">{{ scope.label }}</Badge>
              <Badge
                v-if="isUnverifiedScope(scope.level)"
                variant="destructive"
                class="text-[10px]"
              >
                {{ scope.statusLabel ?? t('portal.access.unverified') }}
              </Badge>
              <code class="text-muted-foreground min-w-0 font-mono text-[11px] break-all">{{ scope.name }}</code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                :data-testid="tooltipKey('scope-info', scope.name)"
                class="text-muted-foreground size-6 shrink-0 rounded-full hover:text-foreground"
                :aria-label="
                  t('portal.access.scope_info', {
                    scope: scope.name,
                    description: scope.description,
                  })
                "
                :aria-describedby="tooltipKey('scope-tooltip', scope.name)"
              >
                <Info class="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <span
              :id="tooltipKey('scope-tooltip', scope.name)"
              data-testid="access-info-tooltip"
              role="tooltip"
              class="bg-popover text-popover-foreground pointer-events-none invisible absolute top-full left-0 z-20 mt-2 w-64 rounded-xl border px-3 py-2 text-xs leading-relaxed opacity-0 shadow-[var(--shadow-glass-sm)] transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
            >
              {{ scope.description }}
            </span>
          </div>
          <span v-if="resolvedScopes.length === 0" class="text-muted-foreground text-xs italic">
            {{ t('portal.access.no_scopes') }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
