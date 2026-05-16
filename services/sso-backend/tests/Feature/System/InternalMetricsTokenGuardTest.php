<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Config;

beforeEach(function (): void {
    Config::set('sso.observability.internal_queue_metrics_enabled', true);
    Config::set('sso.observability.internal_metrics_token_header', 'X-SSO-Internal-Metrics-Token');
    Config::set('sso.observability.internal_metrics_token', 'secret-metrics-token');
});

it('rejects internal queue metrics requests without the configured header token', function (): void {
    $response = $this->getJson('/_internal/queue-metrics');

    expect($response->status())->toBe(401);
    $response->assertHeader('Content-Type', 'application/json');
    $response->assertExactJson(['error' => 'unauthorized']);
});

it('rejects internal queue metrics requests with a wrong header token', function (): void {
    $response = $this->withHeaders(['X-SSO-Internal-Metrics-Token' => 'wrong-token'])
        ->getJson('/_internal/queue-metrics');

    expect($response->status())->toBe(401);
});

it('allows internal queue metrics requests with the matching header token', function (): void {
    $response = $this->withHeaders(['X-SSO-Internal-Metrics-Token' => 'secret-metrics-token'])
        ->getJson('/_internal/queue-metrics');

    $response->assertOk();
});

it('rejects internal performance metrics requests without the configured header token in production-like envs', function (): void {
    Config::set('app.env', 'production');

    $response = $this->getJson('/_internal/performance-metrics');

    expect($response->status())->toBe(401);
});

it('allows internal performance metrics requests with the matching header token even in production', function (): void {
    Config::set('app.env', 'production');

    $response = $this->withHeaders(['X-SSO-Internal-Metrics-Token' => 'secret-metrics-token'])
        ->getJson('/_internal/performance-metrics');

    $response->assertOk();
});

it('disables the token guard when no token is configured but keeps existing env/feature gates intact', function (): void {
    Config::set('sso.observability.internal_metrics_token', null);

    $response = $this->getJson('/_internal/queue-metrics');

    $response->assertOk();
});
