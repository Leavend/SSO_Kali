<?php

declare(strict_types=1);

namespace App\Services\Admin;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class AdminDashboardSummaryService
{
    public const CACHE_TTL_SECONDS = 30;

    public const CACHE_KEY = 'admin:dashboard:summary:v1';

    /**
     * @return array<string, mixed>
     */
    public function snapshot(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL_SECONDS, function (): array {
            return [
                'generated_at' => now()->toIso8601String(),
                'counters' => [
                    'users' => $this->userCounters(),
                    'sessions' => $this->sessionCounters(),
                    'clients' => $this->clientCounters(),
                    'audit' => $this->auditCounters(),
                    'incidents' => $this->incidentCounters(),
                    'data_subject_requests' => $this->dsrCounters(),
                ],
            ];
        });
    }

    public function flush(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * @return array<string, int>
     */
    private function userCounters(): array
    {
        $total = (int) DB::table('users')->count();
        $active = (int) DB::table('users')->where('status', 'active')->count();
        $disabled = (int) DB::table('users')->where('status', 'disabled')->count();
        $locked = (int) DB::table('users')
            ->whereNotNull('locked_at')
            ->where(function ($q): void {
                $q->whereNull('locked_until')->orWhere('locked_until', '>', now());
            })
            ->count();

        return [
            'total' => $total,
            'active' => $active,
            'disabled' => $disabled,
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
