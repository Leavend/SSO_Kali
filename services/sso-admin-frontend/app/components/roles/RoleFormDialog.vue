<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  validateCreateRole,
  validateUpdateRole,
  type RoleFormFieldErrors,
} from '@/lib/roles/role-form'
import { formatSupportReference } from '@/lib/display-identifiers'
import type { AdminRole, CreateRolePayload, UpdateRolePayload } from '@/types/users.types'

interface Props {
  readonly open: boolean
  readonly mode: 'create' | 'edit'
  readonly role?: AdminRole | null
  readonly createTitle: string
  readonly editTitle: string
  readonly slugLabel: string
  readonly nameLabel: string
  readonly descriptionLabel: string
  readonly saveLabel: string
  readonly cancelLabel: string
  readonly stepUpLabel: string
  readonly submitting?: boolean
  readonly fieldErrors?: RoleFormFieldErrors
  readonly errorMessage?: string | null
  readonly requestId?: string | null
  readonly stepUpUrl?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  role: null,
  submitting: false,
  fieldErrors: undefined,
  errorMessage: null,
  requestId: null,
  stepUpUrl: null,
})

const emit = defineEmits<{
  (event: 'submit', payload: CreateRolePayload | UpdateRolePayload): void
  (event: 'cancel'): void
}>()

const slug = ref('')
const name = ref('')
const description = ref('')
const submitAttempted = ref(false)

// Re-seed local state every time the dialog (re)opens or its target changes, so
// edit mode prefills the role and create mode starts blank. Client errors stay
// hidden until the first submit attempt; server fieldErrors always render.
watch(
  () => [props.open, props.mode, props.role] as const,
  () => {
    if (!props.open) return
    slug.value = props.role?.slug ?? ''
    name.value = props.role?.name ?? ''
    description.value = props.role?.description ?? ''
    submitAttempted.value = false
  },
  { immediate: true },
)

const validation = computed(() =>
  props.mode === 'create'
    ? validateCreateRole({ slug: slug.value, name: name.value, description: description.value })
    : validateUpdateRole({ name: name.value, description: description.value }),
)

function fieldError(field: 'slug' | 'name' | 'description'): string | undefined {
  return (
    props.fieldErrors?.[field] ??
    (submitAttempted.value ? validation.value.fieldErrors[field] : undefined)
  )
}

const title = computed(() => (props.mode === 'create' ? props.createTitle : props.editTitle))
const reference = computed(() => (props.requestId ? formatSupportReference(props.requestId) : null))
const canSubmit = computed(() => validation.value.valid && !props.submitting)

function onSubmit(): void {
  submitAttempted.value = true
  const result = validation.value
  if (!result.valid || !result.payload || props.submitting) return
  emit('submit', result.payload)
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="role-form-dialog"
    :title="title"
    :description="title"
    :close-label="cancelLabel"
    @close="emit('cancel')"
  >
    <form class="role-form" data-testid="role-form" @submit.prevent="onSubmit">
      <UiFormField id="role_slug" :label="slugLabel" :error="fieldError('slug')" required>
        <UiInput
          id="role_slug"
          v-model="slug"
          autocomplete="off"
          :disabled="mode === 'edit'"
          :invalid="Boolean(fieldError('slug'))"
        />
      </UiFormField>

      <UiFormField id="role_name" :label="nameLabel" :error="fieldError('name')" required>
        <UiInput
          id="role_name"
          v-model="name"
          autocomplete="off"
          :invalid="Boolean(fieldError('name'))"
        />
      </UiFormField>

      <UiFormField
        id="role_description"
        :label="descriptionLabel"
        :error="fieldError('description')"
      >
        <UiTextarea
          id="role_description"
          v-model="description"
          :rows="3"
          :invalid="Boolean(fieldError('description'))"
        />
      </UiFormField>

      <p v-if="errorMessage" class="role-form__error" role="alert" data-testid="role-form-error">
        {{ errorMessage }}
        <span v-if="reference" class="role-form__ref">{{ reference }}</span>
      </p>

      <a v-if="stepUpUrl" class="role-form__step-up" :href="stepUpUrl" data-testid="step-up-link">
        {{ stepUpLabel }}
      </a>

      <div class="role-form__actions">
        <UiButton type="button" variant="ghost" size="sm" @click="emit('cancel')">
          {{ cancelLabel }}
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          size="sm"
          :disabled="!canSubmit"
          data-testid="role-form-submit"
        >
          {{ saveLabel }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.role-form {
  display: grid;
  gap: 16px;
}
.role-form__error {
  margin: 0;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--danger);
}
.role-form__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.role-form__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.role-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
