/**
 * useProfileForm — profile edit form state + persistence orchestration.
 */

import { computed, onMounted, reactive, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useAsyncAction, type UseAsyncActionReturn } from '@/composables/useAsyncAction'
import { validationErrors } from '@/lib/api/safe-error-presenter'
import {
  applyProfileToForm,
  emptyProfileForm,
  hasProfileChanges,
  profileInitials,
  profileStatusText,
  restoreProfileBaseline,
  safeProfileErrorMessage,
  syncProfileBaseline,
  type ProfileFormState,
} from '@/lib/profile-form'
import { useProfileStore } from '@/stores/profile.store'
import type { ProfilePortal } from '@/types/profile.types'

interface UseProfileFormReturn {
  form: ProfileFormState
  avatarInput: Ref<HTMLInputElement | null>
  load: UseAsyncActionReturn<[], void>
  save: UseAsyncActionReturn<[], void>
  safeLoadError: ComputedRef<string | null>
  safeSaveError: ComputedRef<string | null>
  accountSummary: ComputedRef<ProfilePortal['profile'] | undefined>
  isDirty: ComputedRef<boolean>
  avatarInitials: ComputedRef<string>
  displayNameText: ComputedRef<string>
  emailText: ComputedRef<string>
  givenNameError: ComputedRef<string | null>
  familyNameError: ComputedRef<string | null>
  displayNameError: ComputedRef<string | null>
  statusLabel: ComputedRef<string>
  isStatusActive: ComputedRef<boolean>
  isSaveSuccess: Ref<boolean>
  showSaveSuccess: ComputedRef<boolean>
  handleSave: () => Promise<void>
  handleCancel: () => void
  openAvatarPicker: () => void
}

export function useProfileForm(): UseProfileFormReturn {
  const profile = useProfileStore()
  const form = reactive<ProfileFormState>(emptyProfileForm())
  const baseline = reactive<ProfileFormState>(emptyProfileForm())
  const avatarInput = ref<HTMLInputElement | null>(null)
  const isSaveSuccess = ref(false)

  const load = useAsyncAction(() => profile.loadProfile())
  const save = useAsyncAction(() => profile.updateProfile({ ...form }))
  const fieldErrors = computed<Record<string, string>>(() => validationErrors(save.error.value))
  const accountSummary = computed(() => profile.profile?.profile)
  const isDirty = computed<boolean>(() => hasProfileChanges(form, baseline))
  const displayNameText = computed<string>(
    () => accountSummary.value?.display_name ?? 'Belum tersedia',
  )
  const emailText = computed<string>(() => accountSummary.value?.email ?? 'Email belum tersedia')
  const isStatusActive = computed<boolean>(() => accountSummary.value?.status === 'active')
  const avatarInitials = computed<string>(() => profileInitials(displayNameText.value))
  const givenNameError = computed<string | null>(() => fieldErrors.value.given_name ?? null)
  const familyNameError = computed<string | null>(() => fieldErrors.value.family_name ?? null)
  const displayNameError = computed<string | null>(() => fieldErrors.value.display_name ?? null)
  const statusLabel = computed<string>(() => profileStatusText(accountSummary.value?.status))
  const safeLoadError = computed<string | null>(() => safeProfileErrorMessage(load.error.value))
  const safeSaveError = computed<string | null>(() => safeProfileErrorMessage(save.error.value))
  const showSaveSuccess = computed<boolean>(() => isSaveSuccess.value && !isDirty.value)

  onMounted(() => {
    void load.run()
  })

  watch(
    () => profile.profile,
    (value) => {
      if (!value) return
      applyProfileToForm(form, baseline, value.profile)
    },
    { immediate: true },
  )

  async function handleSave(): Promise<void> {
    if (!isDirty.value) return
    isSaveSuccess.value = false
    await save.run()
    if (!save.error.value) {
      syncProfileBaseline(form, baseline)
      isSaveSuccess.value = true
    }
  }

  function handleCancel(): void {
    restoreProfileBaseline(form, baseline)
    isSaveSuccess.value = false
    save.reset()
  }

  function openAvatarPicker(): void {
    avatarInput.value?.click()
  }

  return {
    form,
    avatarInput,
    load,
    save,
    safeLoadError,
    safeSaveError,
    accountSummary,
    isDirty,
    avatarInitials,
    displayNameText,
    emailText,
    givenNameError,
    familyNameError,
    displayNameError,
    statusLabel,
    isStatusActive,
    isSaveSuccess,
    showSaveSuccess,
    handleSave,
    handleCancel,
    openAvatarPicker,
  }
}
