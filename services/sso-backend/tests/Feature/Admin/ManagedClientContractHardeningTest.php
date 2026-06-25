<?php

declare(strict_types=1);

use App\Actions\Admin\UpdateManagedClientAction;
use App\Models\OidcClientEntitlement;
use App\Models\OidcClientRegistration;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\EntitlementGuard;
use App\Services\Oidc\WidgetOriginPolicy;
use App\Support\Oidc\TrustedRedirectUriPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * @param  array<string, mixed>  $overrides
 */
function hardeningRegistration(array $overrides = []): OidcClientRegistration
{
    return OidcClientRegistration::query()->create(array_merge([
        'client_id' => 'hardening-app',
        'display_name' => 'Hardening App',
        'type' => 'confidential',
        'environment' => 'production',
        'app_base_url' => 'https://app.hardening.test',
        'redirect_uris' => ['https://app.hardening.test/callback'],
        'post_logout_redirect_uris' => ['https://app.hardening.test'],
        'secret_hash' => '$2y$12$existing-secret-hash',
        'owner_email' => 'owner@hardening.test',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
        'category' => 'publik',
    ], $overrides));
}

describe('Dynamic client category fail-closed', function (): void {
    it('denies a dynamically-registered staff app whose category is empty, even for entitled staff', function (): void {
        config()->set('oidc_clients.clients', []);
        hardeningRegistration(['client_id' => 'empty-category-app', 'category' => '']);
        app(DownstreamClientRegistry::class)->flush();

        $user = User::factory()->create(['role' => 'pegawai']);
        OidcClientEntitlement::grant('empty-category-app', $user, 'test');

        $client = app(DownstreamClientRegistry::class)->find('empty-category-app');

        expect($client)->not->toBeNull()
            ->and(app(EntitlementGuard::class)->allows($user, $client))->toBeFalse();
    });

    it('still allows a properly-categorized kepegawaian client for entitled staff', function (): void {
        config()->set('oidc_clients.clients', []);
        hardeningRegistration(['client_id' => 'staff-app', 'category' => 'kepegawaian']);
        app(DownstreamClientRegistry::class)->flush();

        $user = User::factory()->create(['role' => 'pegawai']);
        OidcClientEntitlement::grant('staff-app', $user, 'test');

        $client = app(DownstreamClientRegistry::class)->find('staff-app');

        expect(app(EntitlementGuard::class)->allows($user, $client))->toBeTrue();
    });
});

describe('Widget CORS trust write path', function (): void {
    it('allow-lists the client origin once an admin marks it widget_cors_trusted', function (): void {
        config()->set('oidc_clients.clients', []);
        $registration = hardeningRegistration();
        $admin = User::factory()->create(['role' => 'admin']);

        expect(app(WidgetOriginPolicy::class)->allows('https://app.hardening.test'))->toBeFalse();

        app(UpdateManagedClientAction::class)->execute(
            Request::create('/admin/api/clients/hardening-app', 'PATCH'),
            $admin,
            'hardening-app',
            ['widget_cors_trusted' => true],
        );

        $registration->refresh();

        expect($registration->contract['widget_cors_trusted'] ?? null)->toBeTrue()
            ->and(app(WidgetOriginPolicy::class)->allows('https://app.hardening.test'))->toBeTrue();
    });
});

describe('Trusted redirect origin write path', function (): void {
    it('honors a same-request submitted origin and persists it for later updates', function (): void {
        config()->set('oidc_clients.clients', []);
        $registration = hardeningRegistration();
        $admin = User::factory()->create(['role' => 'admin']);
        $policy = app(TrustedRedirectUriPolicy::class);

        $differentOriginCallback = 'https://auth.hardening.test/callback';

        // Rejected until the origin is trusted.
        expect($policy->allows('hardening-app', $differentOriginCallback))->toBeFalse();

        // Same-request submission is honored so the URI and its origin save together.
        expect($policy->allows('hardening-app', $differentOriginCallback, ['https://auth.hardening.test']))->toBeTrue();

        app(UpdateManagedClientAction::class)->execute(
            Request::create('/admin/api/clients/hardening-app', 'PATCH'),
            $admin,
            'hardening-app',
            ['trusted_redirect_origins' => ['https://auth.hardening.test']],
        );

        $registration->refresh();

        expect($registration->contract['trusted_redirect_origins'] ?? [])->toContain('https://auth.hardening.test')
            ->and($policy->allows('hardening-app', $differentOriginCallback))->toBeTrue();
    });
});

describe('Widget CORS grandfather migration', function (): void {
    it('grandfathers an active registration and reverses to a non-null JSON contract', function (): void {
        $registration = hardeningRegistration(['client_id' => 'grandfather-app', 'contract' => []]);

        $migration = require database_path('migrations/2026_06_25_000003_backfill_widget_cors_trusted.php');

        $migration->up();
        $registration->refresh();
        expect($registration->contract['widget_cors_trusted'] ?? null)->toBeTrue();

        $migration->down();

        // Reversal must not write SQL NULL into the NOT NULL contract column.
        $raw = DB::table('oidc_client_registrations')->where('client_id', 'grandfather-app')->value('contract');
        expect($raw)->not->toBeNull();

        $registration->refresh();
        expect($registration->contract['widget_cors_trusted'] ?? null)->toBeNull()
            ->and($registration->contract)->toBe([]);
    });
});

describe('Entitlement backfill completeness', function (): void {
    it('backfills entitlements for staff whose staffing role lives only in the roles relation', function (): void {
        config()->set('oidc_clients.clients', []);
        hardeningRegistration(['client_id' => 'kepeg-backfill', 'category' => 'kepegawaian']);

        // Staff via the roles() relation only; the legacy role column is non-staff.
        $user = User::factory()->create(['role' => 'user']);
        $pegawaiRole = Role::query()->firstOrCreate(['slug' => 'pegawai'], ['name' => 'Pegawai']);
        $user->roles()->sync([$pegawaiRole->id]);

        // Re-run the entitlement migration's table creation + backfill over the seeded data.
        Schema::dropIfExists('oidc_client_entitlements');
        $migration = require database_path('migrations/2026_06_25_000000_create_oidc_client_entitlements_table.php');
        $migration->up();

        expect(
            OidcClientEntitlement::query()
                ->where('client_id', 'kepeg-backfill')
                ->where('user_id', $user->getKey())
                ->whereNull('revoked_at')
                ->exists()
        )->toBeTrue();
    });
});
