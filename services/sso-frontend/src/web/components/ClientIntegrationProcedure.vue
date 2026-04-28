<script setup lang="ts">
import { GitBranch, RotateCcw, ShieldCheck, Siren } from 'lucide-vue-next'

type IntegrationStep = Readonly<{
  title: string
  detail: string
}>

type IntegrationTrack = Readonly<{
  badge: string
  title: string
  description: string
  steps: readonly IntegrationStep[]
}>

const tracks: readonly IntegrationTrack[] = [
  {
    badge: 'Live / Exist',
    title: 'Integrasi aplikasi yang sudah berjalan',
    description: 'Gunakan canary agar autentikasi lama tetap hidup sampai SSO terbukti stabil.',
    steps: [
      {
        title: 'Petakan trust dan data',
        detail: 'Catat domain, owner, callback, logout URI, atribut minimum, dan consent/terms sesuai RFC 7642.',
      },
      {
        title: 'Daftarkan client secara ketat',
        detail: 'Gunakan redirect allowlist eksak, PKCE untuk public client, dan secret vault untuk confidential client.',
      },
      {
        title: 'Pilih provisioning',
        detail: 'Mulai dari just-in-time profile; naikkan ke SCIM saat butuh create, update, deactivate, atau group sync.',
      },
      {
        title: 'Canary lalu cutover',
        detail: 'Aktifkan untuk cohort admin/tester, pantau audit log, lalu perluas trafik setelah callback dan logout valid.',
      },
    ],
  },
  {
    badge: 'Development',
    title: 'Integrasi aplikasi yang sedang dibangun',
    description: 'Pisahkan credential dev dari production agar eksperimen tidak menyentuh sesi live.',
    steps: [
      {
        title: 'Buat client dev',
        detail: 'Gunakan redirect URI dev, sample user, dan scope minimum tanpa memakai secret production.',
      },
      {
        title: 'Bangun callback aman',
        detail: 'Selesaikan authorization code flow, validasi state/nonce, dan simpan sesi di HttpOnly secure cookie.',
      },
      {
        title: 'Sambungkan lifecycle sesi',
        detail: 'Wajib mendukung refresh rotation, idle/absolute timeout, dan back-channel logout berbasis sid.',
      },
      {
        title: 'Promote lewat gates',
        detail: 'Naikkan ke live hanya setelah typecheck, test, scanner, audit log, dan health check hijau.',
      },
    ],
  },
]
</script>

<template>
  <section class="panel integration-runbook" aria-labelledby="client-integration-title">
    <div class="integration-header">
      <span class="integration-icon" aria-hidden="true">
        <GitBranch :size="20" />
      </span>
      <div>
        <span class="integration-eyebrow">RFC 7642 onboarding</span>
        <h2 id="client-integration-title">Prosedur Integrasi Client SSO</h2>
        <p>
          Runbook admin untuk aplikasi live dan development, mencakup trust, provisioning, callback, sesi, audit,
          canary, dan rollback.
        </p>
      </div>
    </div>

    <div class="integration-tracks">
      <article v-for="track in tracks" :key="track.badge" class="integration-track">
        <span class="pill">{{ track.badge }}</span>
        <h3>{{ track.title }}</h3>
        <p>{{ track.description }}</p>
        <ol class="integration-steps">
          <li v-for="step in track.steps" :key="step.title">
            <strong>{{ step.title }}</strong>
            <span>{{ step.detail }}</span>
          </li>
        </ol>
      </article>
    </div>

    <div class="integration-guardrails" aria-label="Lifecycle guardrails">
      <span><ShieldCheck :size="16" aria-hidden="true" /> Zero-downtime canary</span>
      <span><RotateCcw :size="16" aria-hidden="true" /> Rollback client toggle</span>
      <span><Siren :size="16" aria-hidden="true" /> Audit log dan alert</span>
    </div>
  </section>
</template>
