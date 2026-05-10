<?php

declare(strict_types=1);

use App\Enums\SsoErrorCode;
use App\Services\SsoErrors\SsoErrorCatalog;

it('maps required oidc and internal sso errors to safe user messages', function (): void {
    $catalog = new SsoErrorCatalog;

    expect($catalog->message(SsoErrorCode::InvalidGrant)->message)
        ->toContain('kedaluwarsa')
        ->and($catalog->message(SsoErrorCode::InvalidRequest)->message)
        ->toContain('tidak valid')
        ->and($catalog->message(SsoErrorCode::AccessDenied)->message)
        ->toContain('ditolak')
        ->and($catalog->message(SsoErrorCode::NetworkError)->retryAllowed)
        ->toBeTrue()
        ->and($catalog->message(SsoErrorCode::TemporarilyUnavailable)->alternativeLoginAllowed)
        ->toBeTrue()
        ->and($catalog->message(SsoErrorCode::ServerError)->message)
        ->toContain('kode referensi');
});

it('never includes sensitive protocol material in default user messages', function (): void {
    $catalog = new SsoErrorCatalog;
    $messages = array_map(
        fn (SsoErrorCode $code): string => $catalog->message($code)->title.' '.$catalog->message($code)->message,
        SsoErrorCode::cases(),
    );

    expect(implode(' ', $messages))
        ->not->toContain('client_secret')
        ->not->toContain('access_token')
        ->not->toContain('refresh_token')
        ->not->toContain('code_verifier')
        ->not->toContain('password');
});
