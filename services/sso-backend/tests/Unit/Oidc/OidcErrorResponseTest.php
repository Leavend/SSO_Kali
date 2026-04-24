<?php

declare(strict_types=1);

use App\Support\Responses\OidcErrorResponse;

it('returns a JSON error response with RFC 6749 §5.2 shape', function (): void {
    $response = OidcErrorResponse::json('invalid_grant', 'The authorization code is invalid.', 400);

    expect($response->getStatusCode())->toBe(400);

    $body = json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR);

    expect($body)->toMatchArray([
        'error' => 'invalid_grant',
        'error_description' => 'The authorization code is invalid.',
    ]);
});

it('returns the correct HTTP status code for client authentication failure', function (): void {
    $response = OidcErrorResponse::json('invalid_client', 'Client authentication failed.', 401);

    expect($response->getStatusCode())->toBe(401);
});

it('creates a redirect response with error query parameters', function (): void {
    $response = OidcErrorResponse::redirect(
        'http://localhost:3001/auth/callback',
        'access_denied',
        'The user denied the request.',
        'abc123',
    );

    expect($response->getStatusCode())->toBe(302);

    $target = $response->getTargetUrl();
    $parsed = parse_url($target);
    parse_str($parsed['query'] ?? '', $query);

    expect($query)
        ->toHaveKey('error', 'access_denied')
        ->toHaveKey('error_description', 'The user denied the request.')
        ->toHaveKey('state', 'abc123');
});

it('redirect omits state when null', function (): void {
    $response = OidcErrorResponse::redirect(
        'http://localhost:3001/auth/callback',
        'temporarily_unavailable',
        'Upstream error.',
        null,
    );

    $target = $response->getTargetUrl();
    parse_str(parse_url($target, PHP_URL_QUERY) ?? '', $query);

    expect($query)->not->toHaveKey('state');
});

it('redirect appends with & if redirect_uri already has a query string', function (): void {
    $response = OidcErrorResponse::redirect(
        'http://localhost:3001/auth/callback?existing=1',
        'invalid_request',
        'Bad request.',
        null,
    );

    $target = $response->getTargetUrl();

    expect($target)->toContain('?existing=1&error=');
});
