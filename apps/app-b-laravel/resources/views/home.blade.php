@extends('layouts.app', ['title' => 'Dummy App B'])

@section('content')
    <section class="panel">
        <span class="eyebrow">Confidential Client</span>
        <h1 class="title">Dummy App B untuk uji server-side callback dan session sync.</h1>
        <p class="lede">
            App ini melakukan redirect authorize dari server Laravel, menyimpan sesi lokal di session store,
            lalu mendaftarkan partisipasi client ke SSO backend agar back-channel logout bisa memutus sesi lintas aplikasi.
        </p>

        <div class="grid three">
            <article class="card">
                <p class="label">Issuer</p>
                <p class="value">{{ $issuer }}</p>
            </article>
            <article class="card">
                <p class="label">Client ID</p>
                <p class="value">{{ $clientId }}</p>
            </article>
            <article class="card">
                <p class="label">Callback URI</p>
                <p class="value">{{ $callbackUri }}</p>
            </article>
        </div>

        <div class="actions">
            <a class="button" href="/auth/login">Mulai Login Server-side</a>
        </div>
    </section>
@endsection
