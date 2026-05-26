<script setup lang="ts">
import { Save, Upload, UserRound, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import SsoFormField from '@/components/molecules/SsoFormField.vue'
import PortalPageHeader from '@/components/molecules/PortalPageHeader.vue'
import { useProfileForm } from '@/composables/useProfileForm'

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
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      eyebrow="Identitas Akun"
      title="Profil"
      description="Kelola nama dan tampilan akunmu di portal SSO. Email dan nama pengguna tidak bisa diubah untuk menjaga keamanan akun."
      :icon="UserRound"
    />

    <SsoAlertBanner v-if="safeLoadError" tone="error" :message="safeLoadError" />

    <Card data-testid="profile-update-card" class="overflow-hidden">
      <CardHeader>
        <CardTitle>Profil Akun</CardTitle>
        <CardDescription>
          Informasi dasar yang ditampilkan di portal SSO. Kamu hanya bisa mengubah nama. Email dan
          nama pengguna dikunci oleh sistem.
        </CardDescription>
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
              aria-label="Ubah foto profil"
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
              aria-label="Pilih foto profil"
            />
            <div class="grid gap-1">
              <h2 class="text-lg font-semibold">{{ displayNameText }}</h2>
              <p class="text-muted-foreground text-sm">{{ emailText }}</p>
              <p class="text-muted-foreground text-xs">
                Klik avatar untuk mengubah foto profil. Format: JPG, PNG, WebP · Maks 2MB · Rasio
                1:1 disarankan.
              </p>
            </div>
          </div>

          <div class="grid gap-2">
            <div data-testid="profile-name-fields" class="grid gap-4 sm:grid-cols-2 sm:items-start">
              <SsoFormField
                id="profile-given-name"
                v-model="form.given_name"
                data-testid="profile-given-name-field"
                label="Nama depan"
                autocomplete="given-name"
                :disabled="save.pending.value"
                :error="givenNameError"
                class="content-start"
              />
              <SsoFormField
                id="profile-family-name"
                v-model="form.family_name"
                data-testid="profile-family-name-field"
                label="Nama belakang"
                autocomplete="family-name"
                :disabled="save.pending.value"
                :error="familyNameError"
                class="content-start"
              />
            </div>
            <p data-testid="profile-name-helper" class="text-muted-foreground text-xs">
              Nama depan dan nama belakang digabungkan otomatis sebagai nama tampilan.
            </p>
          </div>

          <SsoFormField
            id="profile-display-name"
            v-model="form.display_name"
            label="Nama tampilan"
            autocomplete="name"
            :disabled="save.pending.value"
            :error="displayNameError"
            input-class="data-[invalid=true]:border-destructive"
          >
            <template #label>
              Nama tampilan
              <span class="text-muted-foreground">(dihasilkan otomatis — bisa diubah manual)</span>
            </template>
          </SsoFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <SsoFormField
              id="profile-email"
              :model-value="emailText"
              type="email"
              label="Email"
              hint="Email tidak dapat diubah dari portal. Hubungi administrator."
              readonly
              class="content-start"
              input-class="pr-9"
            />
            <div class="grid content-start gap-2">
              <span class="text-sm font-medium">Status akun</span>
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
              message="Profil berhasil diperbarui."
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
              Batal
            </Button>
            <Button
              data-testid="profile-save-button"
              type="submit"
              class="w-full sm:w-fit"
              :disabled="save.pending.value || !isDirty"
            >
              <Save class="size-4" aria-hidden="true" />
              {{ save.pending.value ? 'Menyimpan…' : 'Simpan Perubahan' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </section>
</template>
