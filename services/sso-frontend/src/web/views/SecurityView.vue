<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ShieldCheck, KeyRound, Fingerprint } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

onMounted(() => {
  if (!session.profile) session.loadProfile()
})

const mfaRequired = computed(() => Boolean(session.profile?.security.mfa_required))
const riskScore = computed(() => session.profile?.security.risk_score ?? 0)
const lastSeen = computed(() => session.profile?.security.last_seen_at ?? null)
</script>

<template>
  <section class="security-view" aria-labelledby="security-title">
    <PageHeader
      eyebrow="Keamanan"
      title="Keamanan Akun"
      description="Lihat status keamanan akun dan fitur tambahan yang akan datang."
    />

    <div class="security-grid">
      <article class="security-card">
        <span class="security-card__icon" aria-hidden="true"><ShieldCheck :size="22" /></span>
        <strong>Multi-factor Authentication</strong>
        <p>
          Status MFA:
          <span class="security-tag" :class="{ 'security-tag--on': mfaRequired }">
            {{ mfaRequired ? 'Aktif' : 'Belum diaktifkan' }}
          </span>
        </p>
        <small>Pengaturan MFA akan tersedia di rilis berikutnya.</small>
      </article>

      <article class="security-card">
        <span class="security-card__icon" aria-hidden="true"><Fingerprint :size="22" /></span>
        <strong>Risiko Login</strong>
        <p>Skor risiko akun saat ini: <strong>{{ riskScore }}</strong>.</p>
        <small>Dihitung berdasarkan pola login terbaru.</small>
      </article>

      <article class="security-card">
        <span class="security-card__icon" aria-hidden="true"><KeyRound :size="22" /></span>
        <strong>Password &amp; Kredensial</strong>
        <p>
          Aktivitas terakhir:
          <strong>{{ lastSeen ? new Date(lastSeen).toLocaleString('id-ID') : '—' }}</strong>
        </p>
        <small>Ganti password via Identity Provider. Fitur reset akan ditambahkan.</small>
      </article>
    </div>
  </section>
</template>

<style scoped>
.security-view {
  display: grid;
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

.security-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.security-card {
  padding: 22px;
  border-radius: 18px;
  border: 1px solid var(--line, rgb(15 23 42 / 8%));
  background: rgb(255 255 255 / 88%);
  display: grid;
  gap: 8px;
}

.security-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent, #2563eb) 14%, transparent);
  color: var(--accent, #2563eb);
}

.security-card strong {
  font-size: 15px;
}

.security-card p {
  margin: 0;
  font-size: 13px;
  color: var(--muted, #64748b);
}

.security-card small {
  font-size: 12px;
  color: var(--muted, #64748b);
}

.security-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgb(148 163 184 / 20%);
  color: #475569;
}

.security-tag--on {
  background: rgb(34 197 94 / 18%);
  color: #15803d;
}
</style>
