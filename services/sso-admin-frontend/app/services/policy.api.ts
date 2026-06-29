import { apiClient } from '@/lib/api/api-client'
import type {
  PolicyMutationResponse,
  PolicyTransitionPayload,
  ProposePolicyPayload,
  SecurityPolicyListResponse,
} from '@/types/policy.types'

// Single network seam for the security-policy versioning domain. The BFF rewrites
// /api/admin/* -> /admin/api/* and injects the Bearer; these four routes are
// already in the Nitro proxy allow-list.
function categoryPath(category: string): string {
  return `/api/admin/security-policies/${encodeURIComponent(category)}`
}

export const policyApi = {
  list(category: string): Promise<SecurityPolicyListResponse> {
    return apiClient.get<SecurityPolicyListResponse>(categoryPath(category))
  },
  propose(category: string, payload: ProposePolicyPayload): Promise<PolicyMutationResponse> {
    return apiClient.post<PolicyMutationResponse>(categoryPath(category), payload)
  },
  activate(
    category: string,
    version: number,
    payload: PolicyTransitionPayload,
  ): Promise<PolicyMutationResponse> {
    return apiClient.post<PolicyMutationResponse>(
      `${categoryPath(category)}/${version}/activate`,
      payload,
    )
  },
  rollback(
    category: string,
    version: number,
    payload: PolicyTransitionPayload,
  ): Promise<PolicyMutationResponse> {
    return apiClient.post<PolicyMutationResponse>(
      `${categoryPath(category)}/${version}/rollback`,
      payload,
    )
  },
}
