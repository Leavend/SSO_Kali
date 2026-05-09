<?php

declare(strict_types=1);

use App\Actions\Admin\UpdateManagedClientAction;
use App\Http\Controllers\Admin\ClientController;
use App\Models\OidcClientRegistration;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

it('updates managed client metadata without exposing or changing secret hashes', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $client = managedClientFixture();

    $updated = app(UpdateManagedClientAction::class)->execute(
        Request::create('/admin/api/clients/prototype-app-a', 'PATCH'),
        $admin,
        'prototype-app-a',
        [
            'display_name' => 'Prototype App A Updated',
            'owner_email' => 'owner-updated@example.com',
            'redirect_uris' => ['https://app-a.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => ['https://app-a.timeh.my.id'],
            'backchannel_logout_uri' => 'https://app-a.timeh.my.id/backchannel/logout',
        ],
    );

    expect($updated->display_name)->toBe('Prototype App A Updated')
        ->and($updated->owner_email)->toBe('owner-updated@example.com')
        ->and($updated->secret_hash)->toBe($client->secret_hash);

    /** @var object $event */
    $event = DB::table('admin_audit_events')->latest('id')->first();
    $context = json_decode((string) $event->context, true, 512, JSON_THROW_ON_ERROR);

    expect($context['client_id'])->toBe('prototype-app-a')
        ->and(json_encode($context, JSON_THROW_ON_ERROR))->not->toContain('secret');
});

it('keeps client response payload secret safe', function (): void {
    $client = managedClientFixture();

    $controller = app(ClientController::class);
    $response = $controller->show($client->client_id);
    $payload = $response->getData(true);

    expect($payload['client']['client_id'])->toBe('prototype-app-a')
        ->and($payload['client']['has_secret_hash'])->toBeTrue()
        ->and($payload['client'])->not->toHaveKey('secret_hash');
});

function managedClientFixture(): OidcClientRegistration
{
    return OidcClientRegistration::query()->create([
        'client_id' => 'prototype-app-a',
        'display_name' => 'Prototype App A',
        'type' => 'confidential',
        'environment' => 'production',
        'app_base_url' => 'https://app-a.timeh.my.id',
        'redirect_uris' => ['https://app-a.timeh.my.id/callback'],
        'post_logout_redirect_uris' => ['https://app-a.timeh.my.id'],
        'backchannel_logout_uri' => 'https://app-a.timeh.my.id/logout',
        'secret_hash' => '$2y$12$existing-secret-hash',
        'owner_email' => 'owner@example.com',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
    ]);
}
