import { apiClient } from '@/lib/api/api-client'
import type {
  CreateUserPayload,
  CreateUserResponse,
  SyncProfilePayload,
  UserDetailResponse,
  UserListResponse,
  UserLockPayload,
  UserMutationResponse,
  UserReasonPayload,
} from '../types'

export const usersApi = {
  create(payload: CreateUserPayload): Promise<CreateUserResponse> {
    return apiClient.post<CreateUserResponse>('/api/admin/users', payload)
  },
  list(): Promise<UserListResponse> {
    return apiClient.get<UserListResponse>('/api/admin/users')
  },
  show(subjectId: string): Promise<UserDetailResponse> {
    return apiClient.get<UserDetailResponse>(`/api/admin/users/${subjectId}`)
  },
  lock(subjectId: string, payload: UserLockPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(`/api/admin/users/${subjectId}/lock`, payload)
  },
  unlock(subjectId: string, payload: UserReasonPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(`/api/admin/users/${subjectId}/unlock`, payload)
  },
  deactivate(
    subjectId: string,
    payload: Required<UserReasonPayload>,
  ): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(`/api/admin/users/${subjectId}/deactivate`, payload)
  },
  reactivate(subjectId: string): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(`/api/admin/users/${subjectId}/reactivate`)
  },
  issuePasswordReset(subjectId: string): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(`/api/admin/users/${subjectId}/password-reset`)
  },
  resetMfa(subjectId: string, payload: Required<UserReasonPayload>): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(`/api/admin/users/${subjectId}/reset-mfa`, payload)
  },
  syncProfile(subjectId: string, payload: SyncProfilePayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(
      `/api/admin/users/${subjectId}/sync-profile`,
      payload,
    )
  },
  syncUserRoles(subjectId: string, roleSlugs: readonly string[]): Promise<UserMutationResponse> {
    return apiClient.put<UserMutationResponse>(`/api/admin/users/${subjectId}/roles`, {
      role_slugs: roleSlugs,
    })
  },
}
