<script setup lang="ts">
import { computed, ref } from 'vue'
import { Mail, Phone, Save, Upload, UserRound, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import SsoFormField from '@/components/molecules/SsoFormField.vue'
import EmailChangeDialog from '@/components/molecules/EmailChangeDialog.vue'
import PhoneChangeDialog from '@/components/molecules/PhoneChangeDialog.vue'
import PortalPageHeader from '@/components/molecules/PortalPageHeader.vue'
import { useProfileForm } from '@/composables/useProfileForm'
import { useProfileStore } from '@/stores/profile.store'
import { storeToRefs } from 'pinia'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const {
  form,
  avatarInput,
  load,
  save,
  safeLoadError,
  safeSaveError,
  isDirty,
  avatarInitials,
  displayNameText,
  emailText,
  givenNameError,
  familyNameError,
  displayNameError,
  statusLabel,
  isStatusActive,
  showSaveSuccess,
  handleSave,
  handleCancel,
  openAvatarPicker,
} = useProfileForm()

const profileStore = useProfileStore()
const { profile } = storeToRefs(profileStore)

const showEmailDialog = ref(false)
const showPhoneDialog = ref(false)

const phoneText = computed<string | null>(() => profile.value?.profile?.phone ?? null)
const phoneDisplay = computed<string>(() => phoneText.value ?? t('portal.profile.not_set'))
const isPhoneSet = computed<boolean>(() => Boolean(phoneText.value))

function onEmailChanged(): Promise<void> {
  showEmailDialog.value = false
  return profileStore.loadProfile()
}

function onPhoneChanged(): Promise<void> {
  showPhoneDialog.value = false
  return profileStore.loadProfile()
}
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      :eyebrow="t('portal.profile.eyebrow')"
      :title="t('portal.profile.title')"
      :description="t('portal.profile.description')"
      :icon="UserRound"
    />

    <SsoAlertBanner v-if="safeLoadError" tone="error" :message="safeLoadError" />

    <Card data-testid="profile-update-card" class="overflow-hidden">
      <CardHeader>
        <CardTitle>Profil Akun</CardTitle>
        <CardDescription> Informasi dasar yang ditampilkan di portal SSO. </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="load.pending.value" class="grid gap-4">
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-10 w-full" />
        </div>

        <form
          v-else
          data-testid="profile-update-form"
          class="grid gap-5"
          novalidate
          @submit.prevent="handleSave"
        >
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              data-testid="profile-avatar-upload"
              class="group relative grid size-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-blue-700 text-lg font-bold text-white shadow-[var(--shadow-glass-sm)] focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
              :aria-label="t('portal.profile.change_avatar')"
              @click="openAvatarPicker"
            >
              {{ avatarInitials }}
              <span
                class="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-background text-foreground shadow"
              >
                <Upload class="size-4" aria-hidden="true" />
              </span>
            </button>
            <input
              ref="avatarInput"
              class="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              :aria-label="t('portal.profile.choose_avatar')"
            />
            <div class="grid gap-1">
              <h2 class="text-lg font-semibold">{{ displayNameText }}</h2>
              <p class="text-muted-foreground text-sm">{{ emailText }}</p>
              <p class="text-muted-foreground text-xs">
                {{ t('portal.profile.avatar_helper') }}
              </p>
            </div>
          </div>

          <div class="grid gap-2">
            <div data-testid="profile-name-fields" class="grid gap-4 sm:grid-cols-2 sm:items-start">
              <SsoFormField
                id="profile-given-name"
                v-model="form.given_name"
                data-testid="profile-given-name-field"
                :label="t('portal.profile.given_name')"
                autocomplete="given-name"
                :disabled="save.pending.value"
                :error="givenNameError"
                class="content-start"
              />
              <SsoFormField
                id="profile-family-name"
                v-model="form.family_name"
                data-testid="profile-family-name-field"
                :label="t('portal.profile.family_name')"
                autocomplete="family-name"
                :disabled="save.pending.value"
                :error="familyNameError"
                class="content-start"
              />
            </div>
            <p data-testid="profile-name-helper" class="text-muted-foreground text-xs">
              {{ t('portal.profile.name_helper') }}
            </p>
          </div>

          <SsoFormField
            id="profile-display-name"
            v-model="form.display_name"
            :label="t('portal.profile.display_name')"
            autocomplete="name"
            :disabled="save.pending.value"
            :error="displayNameError"
            input-class="data-[invalid=true]:border-destructive"
          >
            <template #label>
              {{ t('portal.profile.display_name') }}
              <span class="text-muted-foreground">{{ t('portal.profile.display_name_helper') }}</span>
            </template>
          </SsoFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="grid content-start gap-2">
              <span class="text-sm font-medium">{{ t('portal.profile.email') }}</span>
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground">{{ emailText }}</span>
                <Button type="button" variant="outline" size="sm" @click="showEmailDialog = true">
                  <Mail class="size-3.5" aria-hidden="true" />
                  {{ t('portal.profile.change_email') }}
                </Button>
              </div>
            </div>
            <div class="grid content-start gap-2">
              <span class="text-sm font-medium">{{ t('portal.profile.account_status') }}</span>
              <Badge
                :variant="isStatusActive ? 'default' : 'secondary'"
                class="w-fit bg-success-700 text-white"
              >
                {{ statusLabel }}
              </Badge>
            </div>
          </div>

          <div class="min-h-10">
            <SsoAlertBanner v-if="safeSaveError" tone="error" :message="safeSaveError" />
            <SsoAlertBanner
              v-else-if="showSaveSuccess"
              tone="success"
              :message="t('portal.profile.save_success')"
            />
          </div>

          <div
            data-testid="profile-update-actions"
            class="flex flex-col gap-2 sm:flex-row sm:justify-end"
          >
            <Button
              v-if="isDirty"
              data-testid="profile-cancel-button"
              type="button"
              variant="ghost"
              class="w-full sm:w-fit"
              @click="handleCancel"
            >
              <X class="size-4" aria-hidden="true" />
              {{ t('common.cancel') }}
            </Button>
            <Button
              data-testid="profile-save-button"
              type="submit"
              class="w-full sm:w-fit"
              :disabled="save.pending.value || !isDirty"
            >
              <Save class="size-4" aria-hidden="true" />
              {{ save.pending.value ? t('common.saving') : t('portal.profile.save_changes') }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card data-testid="profile-contact-card">
      <CardHeader>
        <CardTitle>{{ t('portal.profile.contact_title') }}</CardTitle>
        <CardDescription>{{ t('portal.profile.contact_description') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="load.pending.value" class="grid gap-4">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>
        <div v-else class="grid gap-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="grid gap-0.5">
              <span class="text-sm font-medium">{{ t('portal.profile.email') }}</span>
              <span class="text-sm text-muted-foreground">{{ emailText }}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="email-change-button"
              @click="showEmailDialog = true"
            >
              <Mail class="size-3.5" aria-hidden="true" />
              {{ t('portal.profile.change_email') }}
            </Button>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="grid gap-0.5">
              <span class="text-sm font-medium">{{ t('portal.profile.phone') }}</span>
              <span class="text-sm text-muted-foreground">{{ phoneDisplay }}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="phone-change-button"
              @click="showPhoneDialog = true"
            >
              <Phone class="size-3.5" aria-hidden="true" />
              {{ isPhoneSet ? t('portal.profile.change_phone') : t('portal.profile.add_phone') }}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <EmailChangeDialog
      :open="showEmailDialog"
      :current-email="emailText"
      @update:open="showEmailDialog = $event"
      @done="onEmailChanged()"
    />

    <PhoneChangeDialog
      :open="showPhoneDialog"
      :current-phone="phoneText"
      @update:open="showPhoneDialog = $event"
      @done="onPhoneChanged()"
    />
  </section>
</template>
