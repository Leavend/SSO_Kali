<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

/**
 * Health check controllers for FR-003 / UC-77 availability monitoring.
 *
 * - GET /health  → liveness: "is the PHP process alive?" — never probes
 *   dependencies. Safe for loadbalancer liveness checks that should only
 *   fail when the process is dead.
 * - GET /health/ready → readiness: probes DB + Redis + signing keys.
 *   Returns 503 when any dependency is down. Safe for loadbalancer
 *   readiness checks that should remove the pod from rotation during
 *   degraded state.
 */
final class HealthController
{
    public function __invoke(): JsonResponse
    {
        // Liveness — lightweight, never queries dependencies.
        return response()->json([
            'service' => 'sso-backend',
            'healthy' => true,
            'check' => 'liveness',
        ]);
    }

    public function ready(): JsonResponse
    {
        $checks = [
            'database' => $this->probeDatabase(),
            'redis' => $this->probeRedis(),
            'signing_keys' => $this->probeSigningKeys(),
        ];

        $allOk = collect($checks)->every(fn (array $result) => $result['ok'] === true);

        return response()->json([
            'service' => 'sso-backend',
            'ready' => $allOk,
            'checks' => $checks,
            'timestamp' => now()->toIso8601String(),
        ], $allOk ? 200 : 503);
    }

    /**
     * @return array{ok: bool, latency_ms: int, error?: string}
     */
    private function probeDatabase(): array
    {
        $start = hrtime(true);
        try {
            DB::connection()->select('SELECT 1');

            return ['ok' => true, 'latency_ms' => (int) round((hrtime(true) - $start) / 1_000_000)];
        } catch (Throwable $e) {
            return ['ok' => false, 'latency_ms' => -1, 'error' => 'database_unreachable'];
        }
    }

    /**
     * @return array{ok: bool, latency_ms: int, error?: string}
     */
    private function probeRedis(): array
    {
        $start = hrtime(true);
        try {
            Redis::connection()->ping();

            return ['ok' => true, 'latency_ms' => (int) round((hrtime(true) - $start) / 1_000_000)];
        } catch (Throwable $e) {
            return ['ok' => false, 'latency_ms' => -1, 'error' => 'redis_unreachable'];
        }
    }

    /**
     * @return array{ok: bool, error?: string}
     */
    private function probeSigningKeys(): array
    {
        $privatePath = (string) config('sso.signing.private_key_path');
        $publicPath = (string) config('sso.signing.public_key_path');

        if ($privatePath === '' || ! is_readable($privatePath)) {
            return ['ok' => false, 'error' => 'private_key_unreadable'];
        }
        if ($publicPath === '' || ! is_readable($publicPath)) {
            return ['ok' => false, 'error' => 'public_key_unreadable'];
        }

        return ['ok' => true];
    }
}
