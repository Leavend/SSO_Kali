import type {
  AdminUser,
  AdminUserAction,
  AdminUserDraft,
  AdminUserProfilePatch,
} from '@/types/admin.types'

export function emptyAdminUserDraft(): AdminUserDraft {
  return {
    email: '',
    display_name: '',
    given_name: '',
    family_name: '',
    role: 'user',
    password: '',
    local_account_enabled: true,
  }
}

export function trimAdminUserDraft(draft: AdminUserDraft): AdminUserDraft {
  return {
    ...draft,
    email: draft.email.trim(),
    display_name: draft.display_name.trim(),
    password: draft.password?.trim(),
  }
}

export function emptyAdminUserProfilePatch(): AdminUserProfilePatch {
  return { email: '', display_name: '', given_name: '', family_name: '' }
}

export function profilePatchFromUser(user: AdminUser): AdminUserProfilePatch {
  return {
    email: user.email,
    display_name: user.display_name,
    given_name: user.given_name ?? '',
    family_name: user.family_name ?? '',
  }
}

export function trimProfilePatch(patch: AdminUserProfilePatch): AdminUserProfilePatch {
  return {
    email: patch.email?.trim(),
    display_name: patch.display_name?.trim(),
    given_name: patch.given_name?.trim(),
    family_name: patch.family_name?.trim(),
  }
}

export function adminUserActionSuccess(action: AdminUserAction): string {
  const messages: Record<AdminUserAction, string> = {
    deactivate: 'User dinonaktifkan.',
    reactivate: 'User diaktifkan kembali.',
    lock: 'User dikunci.',
    unlock: 'Kunci user dibuka.',
    'password-reset': 'Token reset password dibuat.',
  }
  return messages[action]
}
