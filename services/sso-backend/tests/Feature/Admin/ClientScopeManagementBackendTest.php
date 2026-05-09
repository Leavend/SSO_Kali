<?php

declare(strict_types=1);

use App\Actions\Admin\SyncClientScopesAction;
use App\Http\Controllers\Admin\ClientController;
use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\ScopePolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

it('exposes the backend-owned scope catalog', function (): void {
    $controller = app(ClientController::class);
    $payload = $controller->scopes(app(ScopePolicy::class))->getData(true);

    expect(collect($payload['scopes'])->pluck('name')->all())
        ->toContain('openid', 'profile', 'email', 'roles', 'permissions');
});

it('syncs dynamic client allowed scopes and refreshes the registry without leaking secrets', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $client = OidcClientRegistration::query()->create([
        'client_id' => 'scoped-client',
        'display_name' => 'Scoped Client',
        'type' => 'confidential',
        'environment' => 'production',
        'app_base_url' => 'https://scoped.timeh.my.id',
        'redirect_uris' => ['https://scoped.timeh.my.id/callback'],
        'post_logout_redirect_uris' => ['https://scoped.timeh.my.id'],
        'allowed_scopes' => ['openid', 'profile'],
        'secret_hash' => '$2y$12$existing-secret-hash',
        'owner_email' => 'owner@example.test',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
    ]);

    $updated = app(SyncClientScopesAction::class)->execute(
        Request::create('/admin/api/clients/scoped-client/scopes', 'PUT'),
        $admin,
        $client->client_id,
        ['openid', 'profile', 'roles', 'permissions', 'roles'],
    );

    $registryClient = app(DownstreamClientRegistry::class)->find('scoped-client');
    /** @var object $event */
    $event = DB::table('admin_audit_events')->latest('id')->first();
    $context = json_decode((string) $event->context, true, 512, JSON_THROW_ON_ERROR);

    expect($updated->allowed_scopes)->toBe(['openid', 'profile', 'roles', 'permissions'])
        ->and($registryClient?->allowedScopes)->toBe(['openid', 'profile', 'roles', 'permissions'])
        ->and(json_encode($context, JSON_THROW_ON_ERROR))->not->toContain('secret');
});
