import { apiClient } from '@/lib/api/api-client'
import type {
  AssignRolesPayload,
  CreateUserPayload,
  CreateUserResponse,
  LockPayload,
  PasswordResetResponse,
  ReasonPayload,
  ResetMfaResponse,
  SyncProfilePayload,
  UserDetailResponse,
  UserListResponse,
  UserMutationResponse,
  UserRoleResponse,
} from '@/types/users.types'

// Same-origin BFF paths. The Nitro proxy (server/utils/admin-proxy.ts) injects
// the Bearer access token from event.context and rewrites /api/admin/* →
// /admin/api/* before forwarding to the backend. The browser/SPA is token-blind.
//
// This is the single network seam for the Users domain. Optional fields are
// omitted when empty so the backend's `sometimes`/`nullable` validators never
// see '' or undefined; local_account_enabled is the one exception — false is a
// meaningful create state (account disabled), so it is forwarded explicitly.
function userPath(subjectId: string, action?: string): string {
  return action ? `/api/admin/users/${subjectId}/${action}` : `/api/admin/users/${subjectId}`
}

export const usersApi = {
  list(): Promise<UserListResponse> {
    return apiClient.get<UserListResponse>('/api/admin/users')
  },

  show(subjectId: string): Promise<UserDetailResponse> {
    return apiClient.get<UserDetailResponse>(userPath(subjectId))
  },

  create(payload: CreateUserPayload): Promise<CreateUserResponse> {
    return apiClient.post<CreateUserResponse>('/api/admin/users', {
      email: payload.email,
      display_name: payload.display_name,
      role: payload.role,
      ...(payload.given_name && { given_name: payload.given_name }),
      ...(payload.family_name && { family_name: payload.family_name }),
      ...(payload.password && { password: payload.password }),
      ...(payload.local_account_enabled !== undefined && {
        local_account_enabled: payload.local_account_enabled,
      }),
      ...(payload.nik && { nik: payload.nik }),
      ...(payload.nip && { nip: payload.nip }),
      ...(payload.nisn && { nisn: payload.nisn }),
      ...(payload.birth_date && { birth_date: payload.birth_date }),
    })
  },

  deactivate(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'deactivate'), {
      reason: payload.reason,
    })
  },

  reactivate(subjectId: string): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'reactivate'))
  },

  issuePasswordReset(subjectId: string): Promise<PasswordResetResponse> {
    return apiClient.post<PasswordResetResponse>(userPath(subjectId, 'password-reset'))
  },

  syncProfile(subjectId: string, payload: SyncProfilePayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'sync-profile'), {
      ...(payload.email && { email: payload.email }),
      ...(payload.display_name && { display_name: payload.display_name }),
      ...(payload.given_name && { given_name: payload.given_name }),
      ...(payload.family_name && { family_name: payload.family_name }),
      ...(payload.nik && { nik: payload.nik }),
      ...(payload.nip && { nip: payload.nip }),
      ...(payload.nisn && { nisn: payload.nisn }),
      ...(payload.birth_date && { birth_date: payload.birth_date }),
    })
  },

  resetMfa(subjectId: string, payload: ReasonPayload): Promise<ResetMfaResponse> {
    return apiClient.post<ResetMfaResponse>(userPath(subjectId, 'reset-mfa'), {
      reason: payload.reason,
    })
  },

  lock(subjectId: string, payload: LockPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'lock'), {
      reason: payload.reason,
      ...(payload.locked_until && { locked_until: payload.locked_until }),
    })
  },

  unlock(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'unlock'), {
      reason: payload.reason,
    })
  },

  requireMfa(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'require-mfa'), {
      reason: payload.reason,
    })
  },

  unrequireMfa(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'unrequire-mfa'), {
      reason: payload.reason,
    })
  },

  assignRoles(subjectId: string, payload: AssignRolesPayload): Promise<UserRoleResponse> {
    return apiClient.put<UserRoleResponse>(userPath(subjectId, 'roles'), {
      role_slugs: payload.role_slugs,
    })
  },
}
