<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\ClientController;

it('redacts internal back-channel logout endpoints', function (): void {
    config()->set('oidc_clients.clients', [
        'prototype-app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://app-a.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => [],
            'backchannel_logout_uri' => 'http://app-a-next:3000/api/backchannel/logout',
        ],
        'prototype-app-b' => [
            'type' => 'confidential',
            'redirect_uris' => ['https://app-b.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => [],
            'backchannel_logout_uri' => 'https://bcl.timeh.my.id/backchannel/logout',
        ],
    ]);

    $response = app(ClientController::class)->index();
    $clients = collect($response->getData(true)['clients'] ?? [])->keyBy('client_id');

    expect($clients['prototype-app-a']['backchannel_logout_internal'])->toBeTrue()
        ->and($clients['prototype-app-a']['backchannel_logout_uri'])->toBeNull()
        ->and($clients['prototype-app-b']['backchannel_logout_internal'])->toBeFalse()
        ->and($clients['prototype-app-b']['backchannel_logout_uri'])->toBe('https://bcl.timeh.my.id/backchannel/logout');
});
