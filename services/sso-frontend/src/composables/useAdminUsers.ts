import { reactive, ref } from 'vue'
import { presentSafeError, supportReferenceCopy } from '@/lib/api/safe-error-presenter'
import {
  adminUserActionSuccess,
  emptyAdminUserDraft,
  emptyAdminUserProfilePatch,
  profilePatchFromUser,
  trimAdminUserDraft,
  trimProfilePatch,
} from '@/composables/admin-user-forms'
import { runAdminUserLifecycle, type PendingUserAction } from '@/composables/admin-user-lifecycle'
import { adminUsersApi } from '@/services/admin-users.api'
import type { AdminPasswordReset, AdminUser, AdminUserAction } from '@/types/admin.types'

export function useAdminUsers() {
  const users = ref<readonly AdminUser[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const success = ref<string | null>(null)
  const supportReference = ref<string | null>(null)
  const passwordReset = ref<AdminPasswordReset | null>(null)
  const pendingAction = ref<PendingUserAction | null>(null)
  const confirmOpen = ref(false)
  const reason = ref('')
  const lockedUntil = ref('')
  const editingSubject = ref<string | null>(null)
  const draft = reactive(emptyAdminUserDraft())
  const editDraft = reactive(emptyAdminUserProfilePatch())
  async function load(): Promise<void> {
    loading.value = true
    clearNotice()
    try {
      users.value = await adminUsersApi.list()
    } catch (caught) {
      setError(caught, 'Daftar user tidak dapat dimuat.')
    } finally {
      loading.value = false
    }
  }

  async function create(): Promise<void> {
    await runAction(null, async () => {
      await adminUsersApi.create(trimAdminUserDraft(draft))
      Object.assign(draft, emptyAdminUserDraft())
      success.value = 'User berhasil dibuat.'
      await load()
    })
  }

  async function saveProfile(user: AdminUser): Promise<void> {
    await runAction(user.subject_id, async () => {
      await adminUsersApi.syncProfile(user.subject_id, trimProfilePatch(editDraft))
      success.value = 'Profil user diperbarui.'
      editingSubject.value = null
      await load()
    })
  }

  async function confirmPendingAction(): Promise<void> {
    const pending = pendingAction.value
    if (!pending) return
    confirmOpen.value = false
    await runAction(pending.user.subject_id, () => executePendingAction(pending))
  }

  function requestConfirm(): void {
    if (reasonRequired() && reason.value.trim().length < 5) {
      error.value = 'Isi alasan minimal 5 karakter sebelum melanjutkan.'
      return
    }
    confirmOpen.value = true
  }

  function startAction(action: AdminUserAction, user: AdminUser): void {
    pendingAction.value = { action, user }
    reason.value = ''
    lockedUntil.value = ''
    confirmOpen.value = false
    passwordReset.value = null
  }

  function startEdit(user: AdminUser): void {
    editingSubject.value = user.subject_id
    Object.assign(editDraft, profilePatchFromUser(user))
  }

  function cancelAction(): void {
    pendingAction.value = null
    confirmOpen.value = false
    reason.value = ''
    lockedUntil.value = ''
  }

  return {
    users,
    loading,
    error,
    success,
    supportReference,
    passwordReset,
    pendingAction,
    confirmOpen,
    reason,
    lockedUntil,
    editingSubject,
    draft,
    editDraft,
    load,
    create,
    saveProfile,
    startAction,
    startEdit,
    cancelAction,
    requestConfirm,
    confirmPendingAction,
  }

  async function executePendingAction(pending: PendingUserAction): Promise<void> {
    passwordReset.value = await runAdminUserLifecycle(pending, reason.value, lockedUntil.value)
    success.value = adminUserActionSuccess(pending.action)
    pendingAction.value = null
    await load()
  }

  async function runAction(_subjectId: string | null, action: () => Promise<void>): Promise<void> {
    clearNotice()
    try {
      await action()
    } catch (caught) {
      setError(caught, 'Aksi user gagal diproses.')
    }
  }

  function clearNotice(): void {
    error.value = null
    success.value = null
    supportReference.value = null
  }

  function setError(caught: unknown, fallback: string): void {
    const safe = presentSafeError(caught, fallback)
    error.value = safe.message
    supportReference.value = supportReferenceCopy(safe.supportReference)
  }

  function reasonRequired(): boolean {
    return pendingAction.value?.action !== 'reactivate'
  }
}
