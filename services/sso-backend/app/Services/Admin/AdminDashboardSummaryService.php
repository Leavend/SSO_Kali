<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Support\Cache\ResilientCacheStore;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

final class AdminDashboardSummaryService
{
    public const CACHE_TTL_SECONDS = 30;

    public const CACHE_KEY = 'admin:dashboard:summary:v2';

    public function __construct(private readonly ResilientCacheStore $cache) {}

    /**
     * @return array<string, mixed>
     */
    public function snapshot(): array
    {
        return $this->cache->remember(
            self::CACHE_KEY,
            self::CACHE_TTL_SECONDS,
            fn (): array => $this->buildSnapshot(),
        );
    }

    public function flush(): void
    {
        $this->cache->forget(self::CACHE_KEY);
    }

    /**
     * @return array<string, mixed>
     */
    private function buildSnapshot(): array
    {
        $degraded = [];
        $counters = [
            'users' => $this->safeCounter('users', fn (): array => $this->userCounters(), [
                'total' => null,
                'active' => null,
                'disabled' => null,
                'locked' => null,
            ], $degraded),
            'sessions' => $this->safeCounter('sessions', fn (): array => $this->sessionCounters(), [
                'portal_active' => null,
                'rp_active' => null,
            ], $degraded),
            'clients' => $this->safeCounter('clients', fn (): array => $this->clientCounters(), [
                'total' => null,
                'active' => null,
                'staged' => null,
                'decommissioned' => null,
            ], $degraded),
            'audit' => $this->safeCounter('audit', fn (): array => $this->auditCounters(), [
                'admin_last_24h' => null,
                'auth_last_24h' => null,
            ], $degraded),
            'incidents' => $this->safeCounter('incidents', fn (): array => $this->incidentCounters(), [
                'admin_denied_last_24h' => null,
            ], $degraded),
            'data_subject_requests' => $this->safeCounter('data_subject_requests', fn (): array => $this->dsrCounters(), [
                'submitted' => null,
                'approved' => null,
                'rejected' => null,
                'fulfilled' => null,
                'on_hold' => null,
            ], $degraded),
        ];

        return [
            'generated_at' => now()->toIso8601String(),
            'partial' => $degraded !== [],
            'degraded' => $degraded,
            'counters' => $counters,
        ];
    }

    /**
     * @param  callable(): array<string, int>  $resolver
     * @param  array<string, int|null>  $fallback
     * @param  list<string>  $degraded
     * @return array<string, int|null>
     */
    private function safeCounter(string $name, callable $resolver, array $fallback, array &$degraded): array
    {
        try {
            return $resolver();
        } catch (Throwable $exception) {
            $degraded[] = $name;
            dump($name.' exception: '.$exception->getMessage()."\n".$exception->getTraceAsString());
            Log::warning('[ADMIN_DASHBOARD_COUNTER_DEGRADED]', [
                'counter' => $name,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            return $fallback;
        }
    }

    /**
     * @return array<string, int>
     */
    private function userCounters(): array
    {
        $total = (int) DB::table('users')->count();
        $disabled = (int) DB::table('users')
            ->where('status', 'disabled')
            ->count();
        $deactivated = (int) DB::table('users')
            ->where('status', 'deactivated')
            ->count();
        $locked = (int) DB::table('users')
            ->whereNotIn('status', ['disabled', 'deactivated'])
            ->whereNotNull('locked_at')
            ->where(function ($q): void {
                $q->whereNull('locked_until')->orWhere('locked_until', '>', now());
            })
            ->count();
        $active = (int) DB::table('users')
            ->whereNotIn('status', ['disabled', 'deactivated'])
            ->where(function ($q): void {
                $q->whereNull('locked_at')
                    ->orWhere(function ($q2): void {
                        $q2->whereNotNull('locked_until')->where('locked_until', '<=', now());
                    });
            })
            ->count();

        return [
            'total' => $total,
            'active' => $active,
            'disabled' => $disabled,
            'deactivated' => $deactivated,
            'locked' => $locked,
        ];
    }

    /**
     * @return array<string, int>
     */
    private function sessionCounters(): array
    {
        $portalActive = (int) DB::table('sso_sessions')
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->count();
        $rpActive = (int) DB::table('oidc_rp_sessions')
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->count();

        return [
            'portal_active' => $portalActive,
            'rp_active' => $rpActive,
        ];
    }

    /**
     * @return array<string, int>
     */
    private function clientCounters(): array
    {
        $registrations = DB::table('oidc_client_registrations');

        return [
            'total' => (int) $registrations->clone()->count(),
            'active' => (int) $registrations->clone()->where('lifecycle_stage', 'active')->count(),
            'staged' => (int) $registrations->clone()->where('lifecycle_stage', 'staged')->count(),
            'decommissioned' => (int) $registrations->clone()->where('lifecycle_stage', 'decommissioned')->count(),
        ];
    }

    /**
     * @return array<string, int>
     */
    private function auditCounters(): array
    {
        $start = now()->subDay();
        $admin = (int) DB::table('admin_audit_events')->where('occurred_at', '>=', $start)->count();
        $auth = (int) DB::table('authentication_audit_events')->where('occurred_at', '>=', $start)->count();

        return [
            'admin_last_24h' => $admin,
            'auth_last_24h' => $auth,
        ];
    }

    /**
     * @return array<string, int>
     */
    private function incidentCounters(): array
    {
        $start = now()->subDay();

        return [
            'admin_denied_last_24h' => (int) DB::table('admin_audit_events')
                ->where('outcome', 'denied')
                ->where('occurred_at', '>=', $start)
                ->count(),
        ];
    }

    /**
     * @return array<string, int>
     */
    private function dsrCounters(): array
    {
        $base = DB::table('data_subject_requests');

        return [
            'submitted' => (int) $base->clone()->where('status', 'submitted')->count(),
            'approved' => (int) $base->clone()->where('status', 'approved')->count(),
            'rejected' => (int) $base->clone()->where('status', 'rejected')->count(),
            'fulfilled' => (int) $base->clone()->where('status', 'fulfilled')->count(),
            'on_hold' => (int) $base->clone()->where('status', 'on_hold')->count(),
        ];
    }
}
