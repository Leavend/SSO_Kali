<?php

declare(strict_types=1);

use App\Actions\SsoErrors\RecordSsoErrorAction;
use App\Enums\SsoErrorCode;
use App\Support\SsoErrors\SsoErrorContext;
use Illuminate\Support\Facades\Log;

it('records structured sso errors with reference and correlation id', function (): void {
    Log::spy();

    $reference = app(RecordSsoErrorAction::class)->execute(new SsoErrorContext(
        code: SsoErrorCode::NetworkError,
        safeReason: 'upstream_unavailable',
        technicalReason: 'connect timeout client_secret=hidden access_token=hidden',
        clientId: 'app-a',
        redirectUri: 'https://sso.timeh.my.id/app-a/auth/callback',
        correlationId: 'req-123',
        retryAllowed: true,
        alternativeLoginAllowed: true,
    ));

    expect($reference)->toStartWith('SSOERR-');

    Log::shouldHaveReceived('warning')->withArgs(function (string $message, array $context) use ($reference): bool {
        return $message === '[SSO_ERROR_RECORDED]'
            && $context['error_ref'] === $reference
            && $context['correlation_id'] === 'req-123'
            && $context['error_code'] === 'network_error'
            && $context['redirect_uri_hash'] !== null
            && ! str_contains(json_encode($context, JSON_THROW_ON_ERROR), 'client_secret=hidden')
            && ! str_contains(json_encode($context, JSON_THROW_ON_ERROR), 'access_token=hidden');
    })->once();
});
