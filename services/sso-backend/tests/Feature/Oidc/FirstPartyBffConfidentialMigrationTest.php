<?php

declare(strict_types=1);

use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

beforeEach(function (): void {
    foreach (['sso-frontend-portal', 'sso-admin-panel'] as $clientId) {
        DB::table('oidc_client_registrations')->insert([
            'client_id' => $clientId,
            'display_name' => $clientId,
            'type' => 'public',
            'environment' => 'production',
            'app_base_url' => 'https://example.test',
            'redirect_uris' => json_encode(['https://example.test/auth/callback']),
            'post_logout_redirect_uris' => json_encode(['https://example.test']),
            'owner_email' => 'admin@example.test',
            'provisioning' => 'seeded',
            'contract' => json_encode(['source' => 'test']),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
});

it('migrates both BFF registrations idempotently and rolls them back to public', function (): void {
    config()->set('oidc_clients.first_party_bff_clients', [
        [
            'client_id' => 'sso-frontend-portal',
            'secret' => 'portal-migration-secret',
            'secret_env' => 'SSO_PORTAL_CLIENT_SECRET',
        ],
        [
            'client_id' => 'sso-admin-panel',
            'secret' => 'admin-migration-secret',
            'secret_env' => 'ADMIN_PANEL_CLIENT_SECRET',
        ],
    ]);

    $migration = require database_path('migrations/2026_06_12_000000_migrate_first_party_bff_clients_to_confidential.php');
    $migration->up();

    $firstHashes = DB::table('oidc_client_registrations')
        ->whereIn('client_id', ['sso-frontend-portal', 'sso-admin-panel'])
        ->pluck('secret_hash', 'client_id');

    expect(DB::table('oidc_client_registrations')
        ->whereIn('client_id', ['sso-frontend-portal', 'sso-admin-panel'])
        ->where('type', 'confidential')->count())->toBe(2)
        ->and(app(ClientSecretHashPolicy::class)->verify(
            'portal-migration-secret',
            (string) $firstHashes['sso-frontend-portal'],
        ))->toBeTrue()
        ->and(app(ClientSecretHashPolicy::class)->verify(
            'admin-migration-secret',
            (string) $firstHashes['sso-admin-panel'],
        ))->toBeTrue();

    $migration->up();
    $secondHashes = DB::table('oidc_client_registrations')
        ->whereIn('client_id', ['sso-frontend-portal', 'sso-admin-panel'])
        ->pluck('secret_hash', 'client_id');

    expect($secondHashes->all())->toBe($firstHashes->all())
        ->and(DB::table('oidc_client_registrations')
            ->whereIn('client_id', ['sso-frontend-portal', 'sso-admin-panel'])
            ->where('type', 'confidential')->count())->toBe(2);

    $migration->down();
    expect(DB::table('oidc_client_registrations')
        ->whereIn('client_id', ['sso-frontend-portal', 'sso-admin-panel'])
        ->where('type', 'public')->count())->toBe(2)
        ->and(DB::table('oidc_client_registrations')
            ->whereIn('client_id', ['sso-frontend-portal', 'sso-admin-panel'])
            ->whereNotNull('secret_hash')->count())->toBe(0);
});

it('skips empty secrets without hashing an empty string', function (): void {
    config()->set('oidc_clients.first_party_bff_clients', [
        [
            'client_id' => 'sso-frontend-portal',
            'secret' => '',
            'secret_env' => 'SSO_PORTAL_CLIENT_SECRET',
        ],
        [
            'client_id' => 'sso-admin-panel',
            'secret' => '',
            'secret_env' => 'ADMIN_PANEL_CLIENT_SECRET',
        ],
    ]);
    Log::spy();

    $migration = require database_path('migrations/2026_06_12_000000_migrate_first_party_bff_clients_to_confidential.php');
    $migration->up();

    expect(DB::table('oidc_client_registrations')
        ->whereIn('client_id', ['sso-frontend-portal', 'sso-admin-panel'])
        ->where('type', 'public')->count())->toBe(2)
        ->and(DB::table('oidc_client_registrations')
            ->whereIn('client_id', ['sso-frontend-portal', 'sso-admin-panel'])
            ->whereNotNull('secret_hash')->count())->toBe(0);
    Log::shouldHaveReceived('warning')->twice();
});
