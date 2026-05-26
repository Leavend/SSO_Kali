import { computed, type ComputedRef } from 'vue'
import { useAsyncAction, type UseAsyncActionReturn } from '@/composables/useAsyncAction'
import { profileApi } from '@/services/profile.api'
import type { AuditEvent, AuditListResponse } from '@/types/audit.types'

interface UseSecurityAuditEventsReturn {
  readonly auditEvents: ComputedRef<readonly AuditEvent[]>
  readonly auditLoad: UseAsyncActionReturn<[], AuditListResponse>
  loadAuditEvents: () => Promise<AuditListResponse | null>
}

export function useSecurityAuditEvents(limit: number): UseSecurityAuditEventsReturn {
  const auditLoad = useAsyncAction(() => profileApi.getAuditEvents(undefined, limit))
  const auditEvents = computed<readonly AuditEvent[]>(
    () => auditLoad.lastResult.value?.events ?? [],
  )

  function loadAuditEvents(): Promise<AuditListResponse | null> {
    return auditLoad.run()
  }

  return { auditEvents, auditLoad, loadAuditEvents }
}
