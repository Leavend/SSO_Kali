<?php

declare(strict_types=1);

use App\Services\Zitadel\ZitadelEndpointContract;

it('builds the canonical zitadel upstream endpoints from the issuer', function (): void {
    $contract = app(ZitadelEndpointContract::class);

    expect($contract->url('https://id.example.com/', 'authorization_endpoint'))
        ->toBe('https://id.example.com/oauth/v2/authorize')
        ->and($contract->url('https://id.example.com', 'token_endpoint'))
        ->toBe('https://id.example.com/oauth/v2/token')
        ->and($contract->url('https://id.example.com', 'jwks_uri'))
        ->toBe('https://id.example.com/oauth/v2/keys')
        ->and($contract->url('https://id.example.com', 'end_session_endpoint'))
        ->toBe('https://id.example.com/oidc/v1/end_session');
});

it('rejects unsupported upstream endpoint names', function (): void {
    $contract = app(ZitadelEndpointContract::class);

    expect(fn () => $contract->url('https://id.example.com', 'device_authorization_endpoint'))
        ->toThrow(RuntimeException::class, 'Unsupported ZITADEL endpoint contract');
});
