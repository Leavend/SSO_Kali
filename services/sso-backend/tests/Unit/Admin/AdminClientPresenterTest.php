<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use App\Services\Admin\AdminClientPresenter;
use App\Support\Oidc\DownstreamClient;

it('exposes the client category when presenting a downstream client', function (): void {
    $client = new DownstreamClient(
        clientId: 'staff-portal',
        type: 'confidential',
        redirectUris: ['https://staff.example/callback'],
        postLogoutRedirectUris: [],
        allowedScopes: ['openid'],
        category: 'kepegawaian',
    );

    expect(app(AdminClientPresenter::class)->downstream($client)['category'])
        ->toBe('kepegawaian');
});

it('exposes the client category when presenting a registration', function (): void {
    $registration = (new OidcClientRegistration)->forceFill([
        'client_id' => 'staff-portal',
        'display_name' => 'Staff Portal',
        'type' => 'confidential',
        'category' => 'kepegawaian',
    ]);

    expect(app(AdminClientPresenter::class)->registration($registration)['category'])
        ->toBe('kepegawaian');
});
