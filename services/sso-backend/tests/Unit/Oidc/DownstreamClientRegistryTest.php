<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

beforeEach(function (): void {
    config()->set('sso.client_secret_hash.memory_cost', 19456);
    config()->set('sso.client_secret_hash.time_cost', 2);
    config()->set('sso.client_secret_hash.threads', 1);

    config()->set('oidc_clients.clients', [
        'static-portal' => [
            'type' => 'confidential',
            'redirect_uris' => ['https://portal.example/auth/callback'],
            'post_logout_redirect_uris' => ['https://portal.example'],
            'backchannel_logout_uri' => 'https://portal.example/api/backchannel/logout',
            'secret' => app(ClientSecretHashPolicy::class)->make('correct-secret'),
        ],
        'static-spa' => [
            'type' => 'public',
            'redirect_uris' => ['https://spa.example/callback'],
            'post_logout_redirect_uris' => ['https://spa.example'],
        ],
    ]);
});

it('finds a static client by id', function (): void {
    $registry = app(DownstreamClientRegistry::class);

    $client = $registry->find('static-portal');

    expect($client)->not->toBeNull()
        ->and($client->clientId)->toBe('static-portal')
        ->and($client->type)->toBe('confidential')
        ->and($client->redirectUris)->toBe(['https://portal.example/auth/callback']);
});

it('returns null for unknown client id', function (): void {
    $registry = app(DownstreamClientRegistry::class);

    expect($registry->find('nonexistent-client'))->toBeNull();
});

it('resolves client only when redirect_uri matches', function (): void {
    $registry = app(DownstreamClientRegistry::class);

    $client = $registry->resolve('static-portal', 'https://portal.example/auth/callback');

    expect($client)->not->toBeNull()
        ->and($client->clientId)->toBe('static-portal');
});

it('returns null resolve when redirect_uri does not match', function (): void {
    $registry = app(DownstreamClientRegistry::class);

    expect($registry->resolve('static-portal', 'https://evil.example/steal'))->toBeNull();
});

it('validates secret for confidential client', function (): void {
    $registry = app(DownstreamClientRegistry::class);
    $client = $registry->find('static-portal');

    expect($registry->validSecret($client, 'correct-secret'))->toBeTrue()
        ->and($registry->validSecret($client, 'wrong-secret'))->toBeFalse();
});

it('rejects empty secret for confidential client', function (): void {
    $registry = app(DownstreamClientRegistry::class);
    $client = $registry->find('static-portal');

    expect($registry->validSecret($client, null))->toBeFalse()
        ->and($registry->validSecret($client, ''))->toBeFalse();
});

it('skips secret check for public client', function (): void {
    $registry = app(DownstreamClientRegistry::class);
    $client = $registry->find('static-spa');

    expect($registry->validSecret($client, null))->toBeTrue()
        ->and($registry->validSecret($client, ''))->toBeTrue()
        ->and($registry->validSecret($client, 'anything'))->toBeTrue();
});

it('merges dynamic registrations with static clients', function (): void {
    ensureOidcClientRegistrationsTable();

    OidcClientRegistration::query()->create([
        'client_id' => 'dynamic-app',
        'display_name' => 'Dynamic App',
        'type' => 'public',
        'environment' => 'development',
        'app_base_url' => 'https://dynamic.example',
        'redirect_uris' => ['https://dynamic.example/callback'],
        'post_logout_redirect_uris' => ['https://dynamic.example'],
        'backchannel_logout_uri' => null,
        'owner_email' => 'owner@dynamic.example',
        'provisioning' => 'jit',
        'contract' => [],
        'status' => 'active',
    ]);

    $registry = app(DownstreamClientRegistry::class);

    expect($registry->find('dynamic-app'))->not->toBeNull()
        ->and($registry->find('dynamic-app')->clientId)->toBe('dynamic-app')
        ->and($registry->find('static-portal'))->not->toBeNull()
        ->and($registry->ids())->toContain('static-portal', 'static-spa', 'dynamic-app');
});

it('static client takes priority over dynamic registration with same id', function (): void {
    ensureOidcClientRegistrationsTable();

    OidcClientRegistration::query()->create([
        'client_id' => 'static-portal',
        'display_name' => 'Shadow Portal',
        'type' => 'public',
        'environment' => 'development',
        'app_base_url' => 'https://shadow.example',
        'redirect_uris' => ['https://shadow.example/callback'],
        'post_logout_redirect_uris' => ['https://shadow.example'],
        'backchannel_logout_uri' => null,
        'owner_email' => 'shadow@example.com',
        'provisioning' => 'jit',
        'contract' => [],
        'status' => 'active',
    ]);

    $registry = app(DownstreamClientRegistry::class);
    $client = $registry->find('static-portal');

    expect($client->type)->toBe('confidential')
        ->and($client->redirectUris)->toBe(['https://portal.example/auth/callback']);
});

it('returns ids from both static and dynamic clients', function (): void {
    ensureOidcClientRegistrationsTable();

    OidcClientRegistration::query()->create([
        'client_id' => 'dynamic-dashboard',
        'display_name' => 'Dynamic Dashboard',
        'type' => 'confidential',
        'environment' => 'live',
        'app_base_url' => 'https://dashboard.example',
        'redirect_uris' => ['https://dashboard.example/callback'],
        'post_logout_redirect_uris' => ['https://dashboard.example'],
        'backchannel_logout_uri' => 'https://dashboard.example/api/backchannel/logout',
        'secret_hash' => app(ClientSecretHashPolicy::class)->make('dashboard-secret'),
        'owner_email' => 'admin@dashboard.example',
        'provisioning' => 'scim',
        'contract' => [],
        'status' => 'active',
    ]);

    $registry = app(DownstreamClientRegistry::class);
    $ids = $registry->ids();

    expect($ids)->toContain('static-portal', 'static-spa', 'dynamic-dashboard')
        ->and(count($ids))->toBe(3);
});

it('gracefully returns only static clients when dynamic table does not exist', function (): void {
    if (Schema::hasTable('oidc_client_registrations')) {
        Schema::drop('oidc_client_registrations');
    }

    $registry = app(DownstreamClientRegistry::class);

    expect($registry->ids())->toBe(['static-portal', 'static-spa'])
        ->and($registry->find('static-portal'))->not->toBeNull();
});

/**
 * Ensures the oidc_client_registrations table exists for tests that exercise
 * dynamic client merging. Idempotent -- skips creation if the table is present.
 */
function ensureOidcClientRegistrationsTable(): void
{
    if (Schema::hasTable('oidc_client_registrations')) {
        OidcClientRegistration::query()->delete();

        return;
    }

    Schema::create('oidc_client_registrations', function (Blueprint $table): void {
        $table->id();
        $table->string('client_id', 63)->unique();
        $table->string('display_name');
        $table->string('type', 16);
        $table->string('environment', 16);
        $table->string('app_base_url');
        $table->json('redirect_uris');
        $table->json('post_logout_redirect_uris');
        $table->string('backchannel_logout_uri')->nullable();
        $table->text('secret_hash')->nullable();
        $table->string('owner_email');
        $table->string('provisioning', 16);
        $table->json('contract');
        $table->string('status', 16)->index();
        $table->string('staged_by_subject_id')->nullable();
        $table->string('staged_by_email')->nullable();
        $table->string('activated_by_subject_id')->nullable();
        $table->string('activated_by_email')->nullable();
        $table->timestamp('activated_at')->nullable();
        $table->timestamp('disabled_at')->nullable();
        $table->timestamps();

        $table->index(['status', 'client_id']);
    });
}
