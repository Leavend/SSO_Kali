/**
 * Profile form pure helpers.
 */

import { presentSafeError } from '@/lib/api/safe-error-presenter'
import type { ProfilePortal } from '@/types/profile.types'

export interface ProfileFormState {
  display_name: string
  given_name: string
  family_name: string
}

export function emptyProfileForm(): ProfileFormState {
  return { display_name: '', given_name: '', family_name: '' }
}

export function safeProfileErrorMessage(error: unknown): string | null {
  return error ? presentSafeError(error).message : null
}

export function hasProfileChanges(current: ProfileFormState, baseline: ProfileFormState): boolean {
  return (
    current.display_name !== baseline.display_name ||
    current.given_name !== baseline.given_name ||
    current.family_name !== baseline.family_name
  )
}

export function applyProfileToForm(
  form: ProfileFormState,
  baseline: ProfileFormState,
  value: ProfilePortal['profile'],
): void {
  form.display_name = value.display_name ?? ''
  form.given_name = value.given_name ?? ''
  form.family_name = resolvedFamilyName(
    value.display_name ?? '',
    value.given_name ?? '',
    value.family_name ?? '',
  )
  syncProfileBaseline(form, baseline)
}

export function syncProfileBaseline(form: ProfileFormState, baseline: ProfileFormState): void {
  baseline.display_name = form.display_name
  baseline.given_name = form.given_name
  baseline.family_name = form.family_name
}

export function restoreProfileBaseline(form: ProfileFormState, baseline: ProfileFormState): void {
  form.display_name = baseline.display_name
  form.given_name = baseline.given_name
  form.family_name = baseline.family_name
}

export function resolvedFamilyName(
  displayName: string,
  givenName: string,
  familyName: string,
): string {
  if (familyName.includes(' ') || !displayName.startsWith(givenName)) return familyName
  const remainingName = displayName.slice(givenName.length).trim()
  return remainingName.length > familyName.length ? remainingName : familyName
}

export function profileInitials(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function profileStatusText(status: string | undefined): string {
  return status === 'active' ? 'Aktif' : 'Tidak Aktif'
}
