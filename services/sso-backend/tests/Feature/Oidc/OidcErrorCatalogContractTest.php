<?php

declare(strict_types=1);

use App\Support\Oidc\OidcErrorCatalog;
use App\Support\Oidc\SafeOidcErrorDescription;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Support\Facades\Route;

it('locks the central oidc error catalog snapshot so new codes go through review', function (): void {
    $codes = OidcErrorCatalog::allCodes();
    sort($codes);

    $expected = [
        'access_denied',
        'account_selection_required',
        'consent_required',
        'forbidden',
        'insufficient_scope',
        'interaction_required',
        'invalid_authorization_code',
        'invalid_client',
        'invalid_client_authentication',
        'invalid_grant',
        'invalid_payload',
        'invalid_pkce',
        'invalid_redirect_uri',
        'invalid_refresh_token',
        'invalid_request',
        'invalid_request_object',
        'invalid_request_uri',
        'invalid_scope',
        'invalid_token',
        'login_required',
        'mfa_reenrollment_required',
        'mfa_required',
        'not_found',
        'pkce_verification_failed',
        'refresh_scope_emptied',
        'registration_not_supported',
        'request_not_supported',
        'request_uri_not_supported',
        'server_error',
        'session_expired',
        'session_not_found',
        'temporarily_unavailable',
        'too_many_attempts',
        'unauthorized_client',
        'unsupported_grant_type',
        'unsupported_response_type',
    ];

    expect($codes)->toBe($expected);
});

it('returns a safe catalog description even when callers pass raw exception text', function (): void {
    $response = OidcErrorResponse::json(
        error: 'invalid_grant',
        description: 'SQLSTATE[23000]: column users.password \\App\\Foo::call() #0 boom',
    );

    $payload = $response->getData(true);

    expect($response->status())->toBe(400)
        ->and($payload['error'])->toBe('invalid_grant')
        ->and($payload['error_description'])->toBe(SafeOidcErrorDescription::for('invalid_grant'))
        ->and($payload)->toHaveKey('error_ref')
        ->and($payload)->toHaveKey('retryable')
        ->and($response->headers->get('X-Error-Ref'))->toBe($payload['error_ref']);
});

it('mirrors the request id back into the error response body and headers', function (): void {
    Route::middleware('web')->get('/__catalog-test', function () {
        return OidcErrorResponse::json('invalid_request');
    });

    $response = $this->withHeaders(['X-Request-Id' => 'req-correlate-1234'])->get('/__catalog-test');

    $response->assertStatus(400);
    $payload = $response->json();

    expect($payload['request_id'])->toBe('req-correlate-1234')
        ->and($response->headers->get('X-Request-Id'))->toBe('req-correlate-1234')
        ->and($payload['error_ref'])->toStartWith('SSOERR-')
        ->and($response->headers->get('X-Error-Ref'))->toBe($payload['error_ref']);
});

it('renders a safe catalog response when an api route throws an unexpected exception', function (): void {
    Route::middleware('web')->get('/__exception-test', function () {
        throw new RuntimeException('SQLSTATE[42S22]: Column not found: 1054');
    });

    $response = $this->withHeaders([
        'Accept' => 'application/json',
        'X-Request-Id' => 'req-exception-1234',
    ])->getJson('/__exception-test');

    $response->assertStatus(500);
    $payload = $response->json();

    expect($payload['error'])->toBe('server_error')
        ->and($payload['error_description'])->toBe(SafeOidcErrorDescription::for('server_error'))
        ->and($payload['error_description'])->not->toContain('SQLSTATE')
        ->and($payload['error_description'])->not->toContain('Column not found')
        ->and($payload['request_id'])->toBe('req-exception-1234')
        ->and($payload['error_ref'])->toStartWith('SSOERR-');
});
