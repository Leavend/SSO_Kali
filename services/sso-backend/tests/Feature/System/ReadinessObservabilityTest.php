<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

it('exposes shallow readiness plus queue observability without leaking payloads', function (): void {
    Redis::shouldReceive('connection->ping')->andReturn('PONG');
    DB::table('jobs')->insert([
        'queue' => 'default',
        'payload' => json_encode(['displayName' => 'SensitiveJob', 'secret' => 'must-not-leak'], JSON_THROW_ON_ERROR),
        'attempts' => 0,
        'reserved_at' => null,
        'available_at' => time(),
        'created_at' => time(),
    ]);

    DB::table('failed_jobs')->insert([
        'uuid' => (string) str()->uuid(),
        'connection' => 'redis',
        'queue' => 'default',
        'payload' => json_encode(['displayName' => 'FailedSensitiveJob', 'token' => 'must-not-leak'], JSON_THROW_ON_ERROR),
        'exception' => 'RuntimeException: synthetic failure',
        'failed_at' => now(),
    ]);

    $this->getJson('/ready')
        ->assertOk()
        ->assertJsonPath('checks.database', true)
        ->assertJsonPath('checks.redis', true)
        ->assertJsonPath('checks.queue.pending_jobs', 1)
        ->assertJsonPath('checks.queue.failed_jobs', 1)
        ->assertJsonMissing(['must-not-leak']);
});
