<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use App\Support\Oidc\TrustedRedirectUriPolicy;
use Illuminate\Support\Facades\DB;

/**
 * @param  array<string, mixed>  $overrides
 */
function maintenanceRegistration(array $overrides = []): OidcClientRegistration
{
    return OidcClientRegistration::query()->create(array_merge([
        'client_id' => 'maintenance-app',
        'display_name' => 'Maintenance App',
        'type' => 'confidential',
        'environment' => 'production',
        // app_base_url is a DIFFERENT origin than the persisted callback host, so
        // without grandfathering an admin re-saving the existing URIs is locked out.
        'app_base_url' => 'https://app.maintenance.test',
        'redirect_uris' => ['https://auth.maintenance.test/callback'],
        'post_logout_redirect_uris' => ['https://auth.maintenance.test/bye'],
        'secret_hash' => '$2y$12$existing-secret-hash',
        'owner_email' => 'owner@maintenance.test',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
        'category' => 'publik',
    ], $overrides));
}

describe('Managed client redirect-URI maintenance', function (): void {
    beforeEach(function (): void {
        config()->set('oidc_clients.clients', []);
    });

    it('grandfathers the origins of already-persisted redirect and post-logout URIs', function (): void {
        maintenanceRegistration();
        $policy = app(TrustedRedirectUriPolicy::class);

        expect($policy->allows('maintenance-app', 'https://auth.maintenance.test/callback'))->toBeTrue()
            ->and($policy->allows('maintenance-app', 'https://auth.maintenance.test/bye'))->toBeTrue()
            ->and($policy->allows('maintenance-app', 'https://app.maintenance.test/new-callback'))->toBeTrue();
    });

    it('still rejects a brand-new untrusted origin unless submitted in the same request', function (): void {
        maintenanceRegistration();
        $policy = app(TrustedRedirectUriPolicy::class);

        expect($policy->allows('maintenance-app', 'https://evil.test/callback'))->toBeFalse()
            ->and($policy->allows('maintenance-app', 'https://new.maintenance.test/cb', ['https://new.maintenance.test']))->toBeTrue();
    });

    it('resolves the trusted-origin set with a single registration query for many URIs', function (): void {
        maintenanceRegistration();
        $policy = app(TrustedRedirectUriPolicy::class);

        DB::enableQueryLog();
        $trusted = $policy->trustedOriginsFor('maintenance-app', []);
        foreach ([
            'https://auth.maintenance.test/a',
            'https://auth.maintenance.test/b',
            'https://app.maintenance.test/c',
        ] as $uri) {
            $policy->permits($uri, $trusted);
        }
        $registrationQueries = array_filter(
            DB::getQueryLog(),
            static fn (array $entry): bool => str_contains((string) $entry['query'], 'oidc_client_registrations'),
        );
        DB::disableQueryLog();

        expect($registrationQueries)->toHaveCount(1);
    });
});
