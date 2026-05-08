<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;

it('exposes internal queue metrics only when explicitly enabled and never leaks payloads', function (): void {
    config(['sso.observability.internal_queue_metrics_enabled' => true]);

    DB::table('jobs')->insert([
        'queue' => 'default',
        'payload' => json_encode(['secret' => 'must-not-leak'], JSON_THROW_ON_ERROR),
        'attempts' => 0,
        'reserved_at' => null,
        'available_at' => time(),
        'created_at' => time() - 10,
    ]);

    DB::table('failed_jobs')->insert([
        'uuid' => (string) str()->uuid(),
        'connection' => 'redis',
        'queue' => 'default',
        'payload' => json_encode(['token' => 'must-not-leak'], JSON_THROW_ON_ERROR),
        'exception' => 'RuntimeException: synthetic failure',
        'failed_at' => now(),
    ]);

    $this->getJson('/_internal/queue-metrics')
        ->assertOk()
        ->assertJsonPath('pending_jobs', 1)
        ->assertJsonPath('failed_jobs', 1)
        ->assertJsonPath('oldest_pending_age_seconds', 10)
        ->assertJsonMissing(['must-not-leak']);
});

it('blocks internal queue metrics by default', function (): void {
    config(['sso.observability.internal_queue_metrics_enabled' => false]);

    $this->getJson('/_internal/queue-metrics')->assertForbidden();
});
