<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use Illuminate\Support\Facades\Artisan;

it('issues a short lived bearer token for the dedicated stress identity only', function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('oidc_clients.load_test_client.enabled', true);
    config()->set('oidc_clients.load_test_client.client_id', 'sso-load-test-client');
    config()->set('oidc_clients.clients.sso-load-test-client', [
        'type' => 'confidential',
        'secret' => 'hash-redacted',
        'redirect_uris' => ['https://load-test.timeh.my.id/oauth/callback'],
        'post_logout_redirect_uris' => ['https://load-test.timeh.my.id/signed-out'],
        'allowed_scopes' => ['openid', 'profile', 'email'],
    ]);

    User::factory()->create([
        'subject_id' => 'usr_stress_sso_prod',
        'email' => 'stress-sso@example.test',
        'display_name' => 'Stress User',
        'status' => 'active',
    ]);

    Artisan::call('sso:issue-stress-token', [
        '--subject-id' => 'usr_stress_sso_prod',
        '--client-id' => 'sso-load-test-client',
        '--scope' => 'openid profile email',
        '--ttl-minutes' => 30,
    ]);

    $output = Artisan::output();

    expect($output)->toContain('STRESS_ACCESS_TOKEN=')
        ->and($output)->toContain('expires_in=1800')
        ->and($output)->not->toContain('refresh_token')
        ->and($output)->not->toContain('client_secret')
        ->and($output)->not->toContain('stress-sso@example.test');
});

it('refuses to issue stress tokens for non stress identities', function (): void {
    User::factory()->create([
        'subject_id' => 'regular-user',
        'email' => 'regular@example.test',
    ]);

    $exitCode = Artisan::call('sso:issue-stress-token', [
        '--subject-id' => 'regular-user',
        '--client-id' => 'sso-load-test-client',
        '--scope' => 'openid profile email',
    ]);

    expect($exitCode)->toBe(1)
        ->and(Artisan::output())->toContain('Only the dedicated stress identity can receive stress tokens.');
});

it('uses LocalTokenService for signed resource tokens', function (): void {
    expect(app(LocalTokenService::class))->toBeInstanceOf(LocalTokenService::class);
});
