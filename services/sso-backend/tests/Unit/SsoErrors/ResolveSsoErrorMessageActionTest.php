<?php

declare(strict_types=1);

use App\Actions\SsoErrors\BuildSsoErrorRedirectAction;
use App\Actions\SsoErrors\ResolveSsoErrorMessageAction;
use App\Enums\SsoErrorCode;
use App\Models\SsoErrorMessageTemplate;
use App\Support\SsoErrors\SsoErrorContext;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('resolves enabled database sso error template before catalog fallback', function (): void {
    SsoErrorMessageTemplate::query()->create([
        'error_code' => 'invalid_grant',
        'locale' => 'id',
        'title' => 'Template Admin Aktif',
        'message' => 'Pesan aman dari admin panel.',
        'action_label' => 'Coba lagi',
        'action_url' => 'https://sso.timeh.my.id/login',
        'retry_allowed' => true,
        'alternative_login_allowed' => false,
        'is_enabled' => true,
    ]);

    $message = app(ResolveSsoErrorMessageAction::class)->execute(SsoErrorCode::InvalidGrant, 'id');

    expect($message->title)->toBe('Template Admin Aktif')
        ->and($message->message)->toBe('Pesan aman dari admin panel.')
        ->and($message->retryAllowed)->toBeTrue();
});

it('falls back to catalog when database template is disabled', function (): void {
    SsoErrorMessageTemplate::query()->create([
        'error_code' => 'invalid_grant',
        'locale' => 'id',
        'title' => 'Disabled Template',
        'message' => 'Tidak boleh dipakai.',
        'action_label' => 'Disabled',
        'retry_allowed' => false,
        'alternative_login_allowed' => false,
        'is_enabled' => false,
    ]);

    $message = app(ResolveSsoErrorMessageAction::class)->execute(SsoErrorCode::InvalidGrant, 'id');

    expect($message->title)->not->toBe('Disabled Template')
        ->and($message->message)->toContain('kedaluwarsa');
});

it('uses resolved safe message fields in frontend error redirect', function (): void {
    config(['sso.frontend_url' => 'https://sso.timeh.my.id']);
    SsoErrorMessageTemplate::query()->create([
        'error_code' => 'network_error',
        'locale' => 'id',
        'title' => 'Koneksi IdP Gagal',
        'message' => 'Coba ulang login beberapa saat lagi.',
        'action_label' => 'Retry Login',
        'retry_allowed' => true,
        'alternative_login_allowed' => true,
        'is_enabled' => true,
    ]);

    $url = app(BuildSsoErrorRedirectAction::class)->execute(
        new SsoErrorContext(
            code: SsoErrorCode::NetworkError,
            safeReason: 'upstream_timeout',
            technicalReason: 'curl timeout client_secret=hidden',
            retryAllowed: false,
            alternativeLoginAllowed: false,
        ),
        'SSOERR-XYZ',
    );

    expect($url)
        ->toContain('title=Koneksi+IdP+Gagal')
        ->toContain('message=Coba+ulang+login+beberapa+saat+lagi')
        ->toContain('action_label=Retry+Login')
        ->toContain('retry_allowed=1')
        ->toContain('alternative_login_allowed=1')
        ->not->toContain('client_secret');
});
