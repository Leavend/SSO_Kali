<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { Save } from 'lucide-vue-next'
import PageHeader from '@/web/components/PageHeader.vue'
import { useSessionStore } from '@/web/stores/session'

const session = useSessionStore()
const saving = ref(false)
const message = ref<string | null>(null)
const form = reactive({
  display_name: '',
  given_name: '',
  family_name: '',
})

onMounted(async () => {
  if (!session.profile) {
    await session.loadProfile()
  }
})

watch(
  () => session.profile,
  (profile) => {
    if (!profile) return
    form.display_name = profile.profile.display_name ?? ''
    form.given_name = profile.profile.given_name ?? ''
    form.family_name = profile.profile.family_name ?? ''
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  saving.value = true
  message.value = null
  try {
    await session.updateProfile({
      display_name: form.display_name,
      given_name: form.given_name,
      family_name: form.family_name,
    })
    message.value = 'Profil berhasil diperbarui.'
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Gagal memperbarui profil.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="profile-view" aria-labelledby="profile-title">
    <PageHeader
      eyebrow="Akun SSO"
      title="Profil"
      description="Tampilan dan data dasar akun SSO kamu."
    />

    <div class="profile-grid">
      <article class="profile-info">
        <h2 id="profile-title">Informasi</h2>
        <dl>
          <div><dt>Subject ID</dt><dd>{{ session.profile?.profile.subject_id ?? '—' }}</dd></div>
          <div><dt>Email</dt><dd>{{ session.profile?.profile.email ?? '—' }}</dd></div>
          <div>
            <dt>Status</dt>
            <dd>{{ session.profile?.profile.status ?? '—' }}</dd>
          </div>
          <div>
            <dt>Login terakhir</dt>
            <dd>
              {{ session.profile?.profile.last_login_at ? new Date(session.profile.profile.last_login_at).toLocaleString('id-ID') : '—' }}
            </dd>
          </div>
        </dl>
      </article>

      <form class="profile-form" @submit.prevent="submit" aria-labelledby="profile-form-title">
        <h2 id="profile-form-title">Perbarui Profil</h2>

        <div class="field-group">
          <label for="profile-display-name">Nama tampilan</label>
          <input id="profile-display-name" v-model="form.display_name" type="text" autocomplete="name" />
        </div>

        <div class="field-row">
          <div class="field-group">
            <label for="profile-given-name">Nama depan</label>
            <input id="profile-given-name" v-model="form.given_name" type="text" autocomplete="given-name" />
          </div>
          <div class="field-group">
            <label for="profile-family-name">Nama belakang</label>
            <input id="profile-family-name" v-model="form.family_name" type="text" autocomplete="family-name" />
          </div>
        </div>

        <button type="submit" class="button button--primary" :disabled="saving">
          <Save :size="16" aria-hidden="true" />
          {{ saving ? 'Menyimpan…' : 'Simpan Perubahan' }}
        </button>
        <p v-if="message" class="profile-message" role="status">{{ message }}</p>
      </form>
    </div>
  </section>
</template>

<style scoped>
.profile-view {
  display: grid;
  gap: 28px;
  max-width: 1100px;
  margin: 0 auto;
}

.profile-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
}

@media (max-width: 860px) {
  .profile-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.profile-info,
.profile-form {
  padding: 22px;
  border-radius: 18px;
  border: 1px solid var(--line, rgb(15 23 42 / 8%));
  background: rgb(255 255 255 / 88%);
  display: grid;
  gap: 16px;
}

.profile-info dl {
  display: grid;
  gap: 12px;
  margin: 0;
}

.profile-info dt {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted, #64748b);
}

.profile-info dd {
  margin: 2px 0 0;
  font-size: 14px;
}

.profile-form {
  gap: 14px;
}

.field-row {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.field-group label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}

.field-group input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--line, rgb(15 23 42 / 14%));
  background: rgb(255 255 255 / 95%);
  font-size: 14px;
}

.profile-message {
  margin: 0;
  color: var(--accent, #2563eb);
  font-size: 13px;
}

.button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
  font-size: 14px;
  cursor: pointer;
}

.button--primary {
  background: var(--accent, #2563eb);
  color: white;
}

.button--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
