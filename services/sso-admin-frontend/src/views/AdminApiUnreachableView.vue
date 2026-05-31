<template>
  <main class="admin-shell">
    <section class="admin-shell__panel">
      <div class="hero-card" role="alert">
        <span class="eyebrow">Admin API</span>
        <h1>Admin API tidak mengembalikan JSON yang valid.</h1>
        <p>
          Panel admin menerima respons sukses yang tidak sesuai kontrak API. Ini biasanya terjadi
          karena route proxy salah, backend tidak terjangkau, atau respons HTML dari upstream.
        </p>
        <div class="action-row" aria-label="Admin API unreachable actions">
          <a class="button button--primary" href="/">Muat Ulang</a>
          <a class="button button--secondary" href="/healthz">Cek Health</a>
        </div>
      </div>
    </section>
  </main>
</template>
