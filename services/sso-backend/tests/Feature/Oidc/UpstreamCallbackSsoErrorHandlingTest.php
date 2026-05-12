<?php

declare(strict_types=1);

use App\Http\Controllers\Oidc\UpstreamCallbackController;
use App\Services\Oidc\AuthRequestStore;
use App\Support\Oidc\SsoAuthFlowCookie;
use Illuminate\Support\Facades\Log;

beforeEach(function (): void {
    config(['sso.frontend_url' => 'https://sso.timeh.my.id']);
    Route::get('/test/upstream/callback', UpstreamCallbackController::class);
});

it('maps upstream access denied callback to safe frontend error with reference', function (): void {
    Log::spy();

    $state = app(AuthRequestStore::class)->put(issue95Context());

    $response = $this->get('/test/upstream/callback?'.http_build_query([
        'state' => $state,
        'error' => 'access_denied',
        'error_description' => 'raw upstream denied with access_token=secret',
    ]));

    $response->assertRedirect();
    $location = (string) $response->headers->get('Location');

    expect($location)
        ->toStartWith('https://sso.timeh.my.id/login?')
        ->toContain('error=access_denied')
        ->toContain('error_ref=SSOERR-')
        ->not->toContain('raw+upstream')
        ->not->toContain('access_token');

    Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $context): bool => $message === '[SSO_ERROR_RECORDED]'
        && $context['error_code'] === 'access_denied'
        && str_starts_with((string) $context['error_ref'], 'SSOERR-'));
});

it('maps missing upstream callback context to frontend session expired error', function (): void {
    Log::spy();

    $response = $this->withCookie(
        SsoAuthFlowCookie::NAME,
        app(SsoAuthFlowCookie::class)->issue(issue95Context())->getValue(),
    )->get('/test/upstream/callback?state=missing-state');

    $response->assertRedirect();
    $location = (string) $response->headers->get('Location');

    expect($location)
        ->toStartWith('https://sso.timeh.my.id/login?')
        ->toContain('error=session_expired')
        ->toContain('error_ref=SSOERR-');
});

/**
 * @return array<string, mixed>
 */
function issue95Context(): array
{
    return [
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'scope' => 'openid profile',
        'nonce' => 'nonce-123',
        'original_state' => 'original-state-123',
        'downstream_code_challenge' => str_repeat('a', 43),
        'session_id' => 'session-123',
        'upstream_code_verifier' => 'sensitive-verifier',
        'upstream_code_challenge' => str_repeat('b', 43),
    ];
}
