import type { CreateRolePayload, UpdateRolePayload } from '@/types/users.types'

// Pure form validation for the role create / edit-metadata dialog. Mirrors the
// backend StoreManagedRole / UpdateManagedRole rules (slug regex + max64, name
// max120, description max255) so the dialog fails fast before a round-trip; the
// server stays the authority. Messages are human-readable fallbacks (the same
// RoleFormFieldErrors shape also carries Laravel's 422 field messages).
export type RoleFormFieldErrors = Readonly<
  Record<'slug' | 'name' | 'description', string | undefined>
>

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/
const SLUG_MAX = 64
const NAME_MAX = 120
const DESCRIPTION_MAX = 255

const MESSAGES = {
  slugRequired: 'Slug is required.',
  slugPattern:
    'Slug must start with a lowercase letter or number and use only lowercase letters, numbers, hyphens, or underscores.',
  slugTooLong: `Slug must be ${SLUG_MAX} characters or fewer.`,
  nameRequired: 'Name is required.',
  nameTooLong: `Name must be ${NAME_MAX} characters or fewer.`,
  descriptionTooLong: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
} as const

function slugError(slug: string): string | undefined {
  if (!slug) return MESSAGES.slugRequired
  if (slug.length > SLUG_MAX) return MESSAGES.slugTooLong
  if (!SLUG_PATTERN.test(slug)) return MESSAGES.slugPattern
  return undefined
}

function nameError(name: string): string | undefined {
  if (!name) return MESSAGES.nameRequired
  if (name.length > NAME_MAX) return MESSAGES.nameTooLong
  return undefined
}

function descriptionError(description: string): string | undefined {
  return description.length > DESCRIPTION_MAX ? MESSAGES.descriptionTooLong : undefined
}

export function validateCreateRole(input: { slug: string; name: string; description: string }): {
  readonly valid: boolean
  readonly fieldErrors: RoleFormFieldErrors
  readonly payload: CreateRolePayload | null
} {
  const slug = input.slug.trim()
  const name = input.name.trim()
  const description = input.description.trim()

  const fieldErrors: RoleFormFieldErrors = {
    slug: slugError(slug),
    name: nameError(name),
    description: descriptionError(description),
  }
  const valid = !fieldErrors.slug && !fieldErrors.name && !fieldErrors.description

  return {
    valid,
    fieldErrors,
    payload: valid ? { slug, name, description: description || null } : null,
  }
}

export function validateUpdateRole(input: { name: string; description: string }): {
  readonly valid: boolean
  readonly fieldErrors: RoleFormFieldErrors
  readonly payload: UpdateRolePayload | null
} {
  const name = input.name.trim()
  const description = input.description.trim()

  const fieldErrors: RoleFormFieldErrors = {
    slug: undefined, // slug is not editable on update
    name: nameError(name),
    description: descriptionError(description),
  }
  const valid = !fieldErrors.name && !fieldErrors.description

  return {
    valid,
    fieldErrors,
    payload: valid ? { name, description: description || null } : null,
  }
}
