<?php

declare(strict_types=1);

use App\Actions\Admin\ExternalIdp\DeleteExternalIdentityProviderAction;
use App\Actions\Admin\ExternalIdp\ListExternalIdentityProvidersAction;
use App\Actions\Admin\ExternalIdp\StoreExternalIdentityProviderAction;
use App\Actions\Admin\ExternalIdp\UpdateExternalIdentityProviderAction;
use App\Http\Controllers\Admin\ExternalIdentityProviderController;
use App\Http\Requests\Admin\StoreExternalIdentityProviderRequest;
use App\Http\Requests\Admin\UpdateExternalIdentityProviderRequest;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Models\User;
use App\Services\ExternalIdp\ExternalIdentityProviderRegistry;
use App\Support\Rbac\AdminPermission;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Validator;

it('enforces external idp admin CRUD validation boundaries', function (): void {
    $storeRules = (new StoreExternalIdentityProviderRequest)->rules();
    $updateRules = (new UpdateExternalIdentityProviderRequest)->rules();

    expect($storeRules['provider_key'])->toContain('regex:/^[a-z0-9_-]+$/')
        ->and($storeRules['issuer'])->toContain('starts_with:https://')
        ->and($storeRules['metadata_url'])->toContain('starts_with:https://')
        ->and($storeRules['allowed_algorithms.*'])->toContain('in:RS256,RS384,RS512,ES256,ES384,ES512')
        ->and($updateRules['metadata_url'])->toContain('starts_with:https://')
        ->and($updateRules)->toHaveKeys(['tls_validation_enabled', 'signature_validation_enabled']);

    $invalid = Validator::make([
        'provider_key' => 'Invalid Provider Key',
        'display_name' => 'Invalid IdP',
        'issuer' => 'http://idp.example.test/realms/sso',
        'metadata_url' => 'http://idp.example.test/.well-known/openid-configuration',
        'client_id' => 'sso-upstream',
        'allowed_algorithms' => ['none'],
        'scopes' => ['openid', 'profile'],
    ], $storeRules);

    expect($invalid->fails())->toBeTrue()
        ->and($invalid->errors()->keys())->toContain('provider_key')
        ->and($invalid->errors()->keys())->toContain('issuer')
        ->and($invalid->errors()->keys())->toContain('metadata_url')
        ->and($invalid->errors()->keys())->toContain('allowed_algorithms.0');
});

it('creates updates lists shows and deletes external idps through admin contracts without leaking secrets', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $storeRequest = externalIdpAdminRequest('/admin/api/external-idps', 'POST', externalIdpAdminPayload());
    $storeRequest->attributes->set('admin_user', $admin);

    $provider = app(StoreExternalIdentityProviderAction::class)->execute($storeRequest, $admin, $storeRequest->all());

    expect($provider->provider_key)->toBe('keycloak-primary')
        ->and($provider->client_secret_encrypted)->not->toBe('super-secret')
        ->and(Crypt::decryptString((string) $provider->client_secret_encrypted))->toBe('super-secret');

    $updateRequest = externalIdpAdminRequest('/admin/api/external-idps/keycloak-primary', 'PATCH', [
        'display_name' => 'Keycloak Updated',
        'client_secret' => 'rotated-secret',
        'enabled' => true,
        'tls_validation_enabled' => true,
        'signature_validation_enabled' => true,
    ]);
    $updateRequest->attributes->set('admin_user', $admin);

    $updated = app(UpdateExternalIdentityProviderAction::class)->execute(
        $updateRequest,
        $admin,
        'keycloak-primary',
        $updateRequest->all(),
    );

    expect($updated->display_name)->toBe('Keycloak Updated')
        ->and($updated->enabled)->toBeTrue()
        ->and(Crypt::decryptString((string) $updated->client_secret_encrypted))->toBe('rotated-secret');

    $controller = app(ExternalIdentityProviderController::class);
    $index = $controller->index(
        externalIdpAdminRequest('/admin/api/external-idps', 'GET'),
        app(ListExternalIdentityProvidersAction::class),
    );
    $show = $controller->show('keycloak-primary');
    $encodedPayload = json_encode([$index->getData(true), $show->getData(true)], JSON_THROW_ON_ERROR);

    expect($encodedPayload)->toContain('has_client_secret')
        ->and($encodedPayload)->toContain('Keycloak Updated')
        ->and($encodedPayload)->not->toContain('super-secret')
        ->and($encodedPayload)->not->toContain('rotated-secret')
        ->and($encodedPayload)->not->toContain('client_secret_encrypted');

    app(DeleteExternalIdentityProviderAction::class)->execute(
        externalIdpAdminRequest('/admin/api/external-idps/keycloak-primary', 'DELETE'),
        $admin,
        'keycloak-primary',
    );

    expect(ExternalIdentityProvider::query()->where('provider_key', 'keycloak-primary')->exists())->toBeFalse();
});

it('preserves existing client secret when update omits secret material', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $request = externalIdpAdminRequest('/admin/api/external-idps', 'POST', externalIdpAdminPayload());
    $provider = app(StoreExternalIdentityProviderAction::class)->execute($request, $admin, $request->all());
    $encryptedSecret = $provider->client_secret_encrypted;

    $updated = app(UpdateExternalIdentityProviderAction::class)->execute(
        externalIdpAdminRequest('/admin/api/external-idps/keycloak-primary', 'PATCH', ['display_name' => 'Renamed IdP']),
        $admin,
        'keycloak-primary',
        ['display_name' => 'Renamed IdP'],
    );

    expect($updated->display_name)->toBe('Renamed IdP')
        ->and($updated->client_secret_encrypted)->toBe($encryptedSecret)
        ->and(Crypt::decryptString((string) $updated->client_secret_encrypted))->toBe('super-secret');
});

it('rejects duplicate provider keys and unknown delete targets with domain errors', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $request = externalIdpAdminRequest('/admin/api/external-idps', 'POST', externalIdpAdminPayload());
    app(StoreExternalIdentityProviderAction::class)->execute($request, $admin, $request->all());

    expect(fn () => app(StoreExternalIdentityProviderAction::class)->execute($request, $admin, $request->all()))
        ->toThrow(UniqueConstraintViolationException::class);

    expect(fn () => app(DeleteExternalIdentityProviderAction::class)->execute(
        externalIdpAdminRequest('/admin/api/external-idps/missing-provider', 'DELETE'),
        $admin,
        'missing-provider',
    ))->toThrow(RuntimeException::class, 'External IdP not found.');
});

it('writes hash chained redacted audit events for external idp admin CRUD', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $request = externalIdpAdminRequest('/admin/api/external-idps', 'POST', externalIdpAdminPayload());

    app(StoreExternalIdentityProviderAction::class)->execute($request, $admin, $request->all());
    app(UpdateExternalIdentityProviderAction::class)->execute($request, $admin, 'keycloak-primary', [
        'client_secret' => 'rotated-secret',
        'enabled' => true,
    ]);
    app(DeleteExternalIdentityProviderAction::class)->execute($request, $admin, 'keycloak-primary');

    $events = AdminAuditEvent::query()
        ->whereIn('action', ['create_external_idp', 'update_external_idp', 'delete_external_idp'])
        ->orderBy('id')
        ->get();
    $encoded = json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR);

    expect($events)->toHaveCount(3)
        ->and($events[0]->event_hash)->not->toBeNull()
        ->and($events[1]->previous_hash)->toBe($events[0]->event_hash)
        ->and($events[2]->previous_hash)->toBe($events[1]->event_hash)
        ->and($encoded)->toContain('has_secret_material')
        ->and($encoded)->not->toContain('super-secret')
        ->and($encoded)->not->toContain('rotated-secret')
        ->and($encoded)->not->toContain('client_secret_encrypted');
});

it('keeps admin route contracts locked to explicit external idp permissions', function (): void {
    $routes = file_get_contents(base_path('routes/admin.php'));

    expect(AdminPermission::all())->toContain(AdminPermission::EXTERNAL_IDPS_READ)
        ->and(AdminPermission::all())->toContain(AdminPermission::EXTERNAL_IDPS_WRITE)
        ->and($routes)->toContain('AdminPermission::EXTERNAL_IDPS_READ')
        ->and($routes)->toContain('AdminPermission::EXTERNAL_IDPS_WRITE')
        ->and($routes)->toContain("EnsureFreshAdminAuth::class.':read'")
        ->and($routes)->toContain("EnsureFreshAdminAuth::class.':step_up'")
        ->and($routes)->toContain('EnsureAdminMfaAssurance::class')
        ->and($routes)->toContain("Route::get('/external-idps'")
        ->and($routes)->toContain("Route::post('/external-idps'")
        ->and($routes)->toContain("Route::patch('/external-idps/{providerKey}'")
        ->and($routes)->toContain("Route::delete('/external-idps/{providerKey}'");
});

it('exposes public registry views with secret presence flags only', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $request = externalIdpAdminRequest('/admin/api/external-idps', 'POST', externalIdpAdminPayload());
    $provider = app(StoreExternalIdentityProviderAction::class)->execute($request, $admin, $request->all());

    $view = app(ExternalIdentityProviderRegistry::class)->publicView($provider);
    $encoded = json_encode($view, JSON_THROW_ON_ERROR);

    expect($view['provider_key'])->toBe('keycloak-primary')
        ->and($view['has_client_secret'])->toBeTrue()
        ->and($encoded)->not->toContain('super-secret')
        ->and($encoded)->not->toContain('client_secret_encrypted')
        ->and($view)->toHaveKeys(['enabled', 'tls_validation_enabled', 'signature_validation_enabled']);
});

/**
 * @return array<string, mixed>
 */
function externalIdpAdminPayload(): array
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
        'priority' => 100,
        'enabled' => false,
        'is_backup' => false,
    ];
}

/**
 * @param  array<string, mixed>  $payload
 */
function externalIdpAdminRequest(string $uri, string $method, array $payload = []): Request
{
    return Request::create($uri, $method, $payload);
}
