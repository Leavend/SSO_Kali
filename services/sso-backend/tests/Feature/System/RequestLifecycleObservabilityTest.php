<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Log;

it('adds a request id response header and structured timing log context', function (): void {
    config([
        'sso.observability.request_timing_log_enabled' => true,
        'sso.observability.request_timing_sample_rate' => 1.0,
        'sso.observability.request_timing_slow_ms' => 0,
    ]);
    Log::spy();

    $this->getJson('/health', ['X-Request-Id' => 'req-observability-001'])
        ->assertOk()
        ->assertHeader('X-Request-Id', 'req-observability-001');

    Log::shouldHaveReceived('info')
        ->with('sso.request_timing', Mockery::on(function (array $context): bool {
            return ($context['request_id'] ?? null) === 'req-observability-001'
                && ($context['method'] ?? null) === 'GET'
                && ($context['path'] ?? null) === '/health'
                && ($context['status'] ?? null) === 200
                && array_key_exists('duration_ms', $context)
                && array_key_exists('memory_peak_mb', $context)
                && array_key_exists('client_ip_hash', $context)
                && array_key_exists('user_agent_hash', $context)
                && array_key_exists('content_length', $context)
                && array_key_exists('query_count', $context)
                && array_key_exists('sampled', $context);
        }));
});

it('generates a request id when upstream does not provide one', function (): void {
    $response = $this->getJson('/health')->assertOk();

    expect($response->headers->get('X-Request-Id'))->toBeString()->not->toBeEmpty();
});
