<?php

declare(strict_types=1);

use App\Actions\Admin\ExternalIdp\DeleteExternalIdentityProviderAction;
use App\Actions\Admin\ExternalIdp\ListExternalIdentityProvidersAction;
use App\Actions\Admin\ExternalIdp\StoreExternalIdentityProviderAction;
use App\Actions\Admin\ExternalIdp\UpdateExternalIdentityProviderAction;
use App\Http\Controllers\Admin\ExternalIdentityProviderController;
use App\Http\Requests\Admin\StoreExternalIdentityProviderRequest;
use App\Http\Requests\Admin\UpdateExternalIdentityProviderRequest;
use App\Models\ExternalIdentityProvider;
use App\Models\User;
use App\Support\Rbac\AdminPermission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

it('creates updates lists shows and deletes external idps with secret redaction', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $storeRequest = adminExternalIdpRequest('/admin/api/external-idps', 'POST', adminExternalIdpPayload());
    $storeRequest->attributes->set('admin_user', $admin);

    $provider = app(StoreExternalIdentityProviderAction::class)->execute($storeRequest, $admin, $storeRequest->all());

    expect($provider->provider_key)->toBe('keycloak-primary')
        ->and($provider->client_secret_encrypted)->not->toBe('super-secret')
        ->and(Crypt::decryptString((string) $provider->client_secret_encrypted))->toBe('super-secret');

    $updateRequest = adminExternalIdpRequest('/admin/api/external-idps/keycloak-primary', 'PATCH', [
        'display_name' => 'Keycloak Updated',
        'client_secret' => 'rotated-secret',
        'enabled' => true,
    ]);
    $updated = app(UpdateExternalIdentityProviderAction::class)->execute($updateRequest, $admin, 'keycloak-primary', $updateRequest->all());

    expect($updated->display_name)->toBe('Keycloak Updated')
        ->and($updated->enabled)->toBeTrue()
        ->and(Crypt::decryptString((string) $updated->client_secret_encrypted))->toBe('rotated-secret');

    $controller = app(ExternalIdentityProviderController::class);
    $index = $controller->index(adminExternalIdpRequest('/admin/api/external-idps', 'GET'), app(ListExternalIdentityProvidersAction::class));
    $show = $controller->show('keycloak-primary');
    $payload = json_encode([$index->getData(true), $show->getData(true)], JSON_THROW_ON_ERROR);

    expect($payload)->toContain('has_client_secret')
        ->and($payload)->not->toContain('super-secret')
        ->and($payload)->not->toContain('rotated-secret')
        ->and($payload)->not->toContain('client_secret_encrypted');

    app(DeleteExternalIdentityProviderAction::class)->execute(
        adminExternalIdpRequest('/admin/api/external-idps/keycloak-primary', 'DELETE'),
        $admin,
        'keycloak-primary',
    );

    expect(ExternalIdentityProvider::query()->where('provider_key', 'keycloak-primary')->exists())->toBeFalse();
});

it('validates admin external idp request contracts and route rbac wiring', function (): void {
    expect((new StoreExternalIdentityProviderRequest)->rules())->toHaveKeys([
        'provider_key',
        'issuer',
        'metadata_url',
        'client_secret',
        'allowed_algorithms.*',
    ])->and((new UpdateExternalIdentityProviderRequest)->rules())->toHaveKeys([
        'metadata_url',
        'client_secret',
        'tls_validation_enabled',
        'signature_validation_enabled',
    ]);

    $routes = file_get_contents(base_path('routes/admin.php'));

    expect(AdminPermission::all())->toContain(AdminPermission::EXTERNAL_IDPS_READ)
        ->and(AdminPermission::all())->toContain(AdminPermission::EXTERNAL_IDPS_WRITE)
        ->and($routes)->toContain('AdminPermission::EXTERNAL_IDPS_READ')
        ->and($routes)->toContain('AdminPermission::EXTERNAL_IDPS_WRITE')
        ->and($routes)->toContain("Route::get('/external-idps'")
        ->and($routes)->toContain("Route::post('/external-idps'")
        ->and($routes)->toContain("Route::patch('/external-idps/{providerKey}'")
        ->and($routes)->toContain("Route::delete('/external-idps/{providerKey}'");
});

it('writes redacted admin audit events for external idp CRUD', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $request = adminExternalIdpRequest('/admin/api/external-idps', 'POST', adminExternalIdpPayload());

    app(StoreExternalIdentityProviderAction::class)->execute($request, $admin, $request->all());
    app(UpdateExternalIdentityProviderAction::class)->execute($request, $admin, 'keycloak-primary', [
        'client_secret' => 'rotated-secret',
    ]);
    app(DeleteExternalIdentityProviderAction::class)->execute($request, $admin, 'keycloak-primary');

    $contexts = DB::table('admin_audit_events')
        ->whereIn('action', ['create_external_idp', 'update_external_idp', 'delete_external_idp'])
        ->pluck('context')
        ->all();
    $encoded = json_encode($contexts, JSON_THROW_ON_ERROR);

    expect($contexts)->toHaveCount(3)
        ->and($encoded)->toContain('has_secret_material')
        ->and($encoded)->not->toContain('super-secret')
        ->and($encoded)->not->toContain('rotated-secret')
        ->and($encoded)->not->toContain('client_secret_encrypted');
});

/**
 * @return array<string, mixed>
 */
function adminExternalIdpPayload(): array
{
    return [
        'provider_key' => 'keycloak-primary',
        'display_name' => 'Keycloak Primary',
        'issuer' => 'https://keycloak.example.test/realms/sso',
        'metadata_url' => 'https://keycloak.example.test/realms/sso/.well-known/openid-configuration',
        'client_id' => 'sso-upstream',
        'client_secret' => 'super-secret',
        'allowed_algorithms' => ['RS256'],
        'scopes' => ['openid', 'profile', 'email'],
    ];
}

/**
 * @param  array<string, mixed>  $payload
 */
function adminExternalIdpRequest(string $uri, string $method, array $payload = []): Request
{
    return Request::create($uri, $method, $payload);
}
