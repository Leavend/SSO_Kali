@extends('layouts.app', ['title' => 'Dashboard App B'])

@php
    $profile = is_array($session['profile'] ?? null) ? $session['profile'] : [];
    $loginContext = is_array($profile['login_context'] ?? null) ? $profile['login_context'] : [];
@endphp

@section('content')
    <section class="panel">
        <span class="eyebrow">Session Active</span>
        <h1 class="title">Handshake App B selesai dan sesi lokal sudah aktif.</h1>
        <p class="lede">
            Access token dan profile snapshot berasal dari Laravel SSO facade. Jika App A melakukan logout terpusat,
            App B akan menerima logout token melalui endpoint back-channel dan sesi ini ikut diputus berdasarkan <code>sid</code>.
        </p>

        <div class="grid three">
            <article class="card">
                <p class="label">Display Name</p>
                <p class="value">{{ $profile['display_name'] ?? $user?->display_name ?? 'Unknown User' }}</p>
            </article>
            <article class="card">
                <p class="label">Email</p>
                <p class="value">{{ $profile['email'] ?? $user?->email ?? 'unknown@example.com' }}</p>
            </article>
            <article class="card">
                <p class="label">Session ID (sid)</p>
                <p class="value">{{ $session['sid'] ?? 'n/a' }}</p>
            </article>
            <article class="card">
                <p class="label">Client ID</p>
                <p class="value">{{ $session['client_id'] ?? 'prototype-app-b' }}</p>
            </article>
            <article class="card">
                <p class="label">Adaptive MFA</p>
                <p class="value">{{ ($loginContext['mfa_required'] ?? false) ? 'Required' : 'Not required' }}</p>
            </article>
            <article class="card">
                <p class="label">Risk Score</p>
                <p class="value">{{ $loginContext['risk_score'] ?? 0 }}</p>
            </article>
        </div>

        <div class="actions">
            <form method="post" action="/auth/logout">
                @csrf
                <button class="button" type="submit">Logout Terpusat</button>
            </form>
            <a class="ghost" href="/">Kembali ke Landing</a>
        </div>
    </section>
@endsection
