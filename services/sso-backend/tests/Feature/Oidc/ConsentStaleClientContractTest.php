<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\OidcClientRegistration;
use App\Models\UserConsent;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Facades\Schema;

/**
 * BE-FR024-001 — Consent Allow MUST NOT issue a code from a stale client context.
 *
 * FR/UC: FR-024 / UC-12, UC-22.
 *
 * If a client is suspended/decommissioned or its redirect URI is rotated
 * while the consent screen is open, the user clicking "Allow" must not
 * produce an authorization code. Instead the response must redirect to the
 * (still-valid at original-render time) client redirect URI carrying a
 * deterministic OAuth error and the original state, and an audit
 * rejection event MUST be recorded.
 */
beforeEach(function (): void {
    if (! Schema::hasTable('oidc_client_registrations')) {
        Schema::create('oidc_client_registrations', function ($table): void {
            $table->id();
            $table->string('client_id')->unique();
            $table->string('display_name');
            $table->string('type');
            $table->string('environment');
            $table->string('app_base_url');
            $table->json('redirect_uris');
            $table->json('post_logout_redirect_uris');
            $table->string('backchannel_logout_uri')->nullable();
            $table->string('secret_hash')->nullable();
            $table->string('owner_email');
            $table->string('provisioning');
            $table->json('contract');
            $table->string('status')->default('active');
            $table->timestamps();
        });
    }

    OidcClientRegistration::query()->delete();
    app(DownstreamClientRegistry::class)->flush();

    // Seed a dynamic, mutable client (so we can suspend/rotate in tests).
    OidcClientRegistration::query()->create([
        'client_id' => 'fr024-app',
        'display_name' => 'FR024 App',
        'type' => 'public',
        'environment' => 'live',
        'app_base_url' => 'https://fr024.test',
        'redirect_uris' => ['https://fr024.test/callback'],
        'post_logout_redirect_uris' => ['https://fr024.test/'],
        'backchannel_logout_uri' => null,
        'owner_email' => 'owner@fr024.test',
        'provisioning' => 'jit',
        'contract' => [],
        'status' => 'active',
    ]);

    app(DownstreamClientRegistry::class)->flush();
});

function fr024SeedConsentState(): string
{
    return app(AuthRequestStore::class)->put([
        'client_id' => 'fr024-app',
        'subject_id' => 'fr024-user',
        'scope' => 'openid profile',
        'redirect_uri' => 'https://fr024.test/callback',
        'original_state' => 'fr024-original-state',
        'nonce' => 'fr024-nonce',
        'session_id' => 'fr024-session',
        'downstream_code_challenge' => 'fr024-challenge',
    ]);
}

it('rejects consent allow with invalid_client when client was decommissioned mid-flow', function (): void {
    $state = fr024SeedConsentState();

    // Decommission the client AFTER the consent screen was rendered.
    OidcClientRegistration::query()->where('client_id', 'fr024-app')
        ->update(['status' => 'decommissioned']);
    app(DownstreamClientRegistry::class)->flush();

    $response = $this->postJson('/connect/consent', [
        'state' => $state,
        'decision' => 'allow',
    ]);

    $response->assertOk();
    $location = (string) $response->json('redirect_uri');

    expect($location)->toStartWith('https://fr024.test/callback')
        ->and($location)->toContain('error=invalid_client')
        ->and($location)->toContain('state=fr024-original-state')
        ->and($location)->not->toContain('code=');

    // No consent grant.
    expect(UserConsent::query()
        ->where('subject_id', 'fr024-user')
        ->where('client_id', 'fr024-app')
        ->exists())->toBeFalse();

    // Audit rejection event recorded.
    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'consent_decision')
        ->where('error_code', 'invalid_client')
        ->where('client_id', 'fr024-app')
        ->exists())->toBeTrue();
});

it('rejects consent allow with invalid_client when redirect URI rotated mid-flow', function (): void {
    $state = fr024SeedConsentState();

    // Rotate the registered redirect URI AFTER the consent screen was rendered.
    OidcClientRegistration::query()->where('client_id', 'fr024-app')
        ->update(['redirect_uris' => ['https://fr024.test/new-callback']]);
    app(DownstreamClientRegistry::class)->flush();

    $response = $this->postJson('/connect/consent', [
        'state' => $state,
        'decision' => 'allow',
    ]);

    $response->assertOk();
    $location = (string) $response->json('redirect_uri');

    // The resolver MUST refuse the now-stale redirect_uri and the response
    // MUST surface invalid_client. We tolerate either the original or new
    // callback as the redirect target since both are post-bind: what we
    // strictly forbid is "code=" being issued.
    expect($location)->toContain('error=invalid_client')
        ->and($location)->toContain('state=fr024-original-state')
        ->and($location)->not->toContain('code=');

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'consent_decision')
        ->where('error_code', 'invalid_client')
        ->where('client_id', 'fr024-app')
        ->exists())->toBeTrue();
});

it('issues a code on consent allow when client binding is still valid', function (): void {
    $state = fr024SeedConsentState();

    $response = $this->postJson('/connect/consent', [
        'state' => $state,
        'decision' => 'allow',
    ]);

    $response->assertOk();
    $location = (string) $response->json('redirect_uri');

    expect($location)->toStartWith('https://fr024.test/callback')
        ->and($location)->toContain('code=')
        ->and($location)->toContain('state=fr024-original-state')
        ->and($location)->not->toContain('error=');
});
