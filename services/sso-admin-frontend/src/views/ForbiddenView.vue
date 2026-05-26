<template>
  <main class="admin-shell">
    <section class="admin-shell__panel">
      <div class="hero-card">
        <span class="eyebrow">Akses Ditolak</span>
        <h1>Akun ini belum memiliki akses admin.</h1>
        <p>
          Kamu sudah login melalui portal SSO, tetapi role akun ini tidak diizinkan membuka admin
          frontend.
        </p>
        <div class="action-row" aria-label="Forbidden actions">
          <a class="button button--primary" href="/home">Kembali ke Portal SSO</a>
        </div>
      </div>
    </section>
  </main>
</template>
