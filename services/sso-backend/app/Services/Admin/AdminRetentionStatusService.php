<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Console\Commands\PruneAdminAuditEventsCommand;
use App\Models\AdminAuditEvent;
use App\Services\Audit\AuthenticationAuditRetentionPolicy;
use Illuminate\Support\Facades\DB;

final class AdminRetentionStatusService
{
    public function __construct(
        private readonly AuthenticationAuditRetentionPolicy $authenticationAuditRetention,
        private readonly AdminRetentionRunMetadata $runs,
    ) {}

    /**
     * @return array{generated_at: string, items: list<array<string, mixed>>}
     */
    public function summary(): array
    {
        return [
            'generated_at' => now()->toIso8601String(),
            'items' => [
                $this->adminAuditEvents(),
                $this->authenticationAuditEvents(),
                $this->refreshTokens(),
                $this->authorizationCodes(),
                $this->telescopeEntries(),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function adminAuditEvents(): array
    {
        $retentionDays = max(
            PruneAdminAuditEventsCommand::MIN_RETENTION_DAYS,
            (int) config('sso.audit.admin_retention_days', 730),
        );
        $cutoff = now()->subDays($retentionDays);

        return $this->item(
            category: 'admin_audit_events',
            label: 'Admin audit events',
            window: ['days' => $retentionDays],
            cutoff: $cutoff->toIso8601String(),
            schedule: 'daily',
            candidateCount: AdminAuditEvent::query()->where('occurred_at', '<', $cutoff)->count(),
        );
    }

    /** @return array<string, mixed> */
    private function authenticationAuditEvents(): array
    {
        $report = $this->authenticationAuditRetention->report();

        return $this->item(
            category: 'authentication_audit_events',
            label: 'Authentication audit events',
            window: ['days' => $report['retention_days']],
            cutoff: $report['cutoff'],
            schedule: 'daily',
            candidateCount: $report['candidate_count'],
        );
    }

    /** @return array<string, mixed> */
    private function refreshTokens(): array
    {
        return $this->item(
            category: 'refresh_tokens',
            label: 'Refresh token rotations',
            window: ['days' => (int) config('sso.ttl.refresh_token_family_days', 90)],
            cutoff: now()->toIso8601String(),
            schedule: 'daily',
            candidateCount: DB::table('refresh_token_rotations')
                ->where(fn ($query) => $query->where('expires_at', '<=', now())->orWhereNotNull('revoked_at'))
                ->count(),
        );
    }

    /** @return array<string, mixed> */
    private function authorizationCodes(): array
    {
        return $this->item(
            category: 'authorization_codes',
            label: 'Authorization codes',
            window: ['seconds' => (int) config('sso.stores.authorization_code_seconds', 120)],
            cutoff: now()->toIso8601String(),
            schedule: 'hourly',
            candidateCount: DB::table('authorization_codes')
                ->where(fn ($query) => $query->where('expires_at', '<=', now())->orWhereNotNull('consumed_at'))
                ->count(),
        );
    }

    /** @return array<string, mixed> */
    private function telescopeEntries(): array
    {
        return $this->item(
            category: 'telescope_entries',
            label: 'Telescope entries',
            window: ['hours' => (int) config('telescope.prune_hours', 48)],
            cutoff: now()->subHours((int) config('telescope.prune_hours', 48))->toIso8601String(),
            schedule: 'daily',
            candidateCount: null,
        );
    }

    /**
     * @param  array<string, int>  $window
     * @return array<string, mixed>
     */
    private function item(
        string $category,
        string $label,
        array $window,
        string $cutoff,
        string $schedule,
        ?int $candidateCount,
    ): array {
        return [
            'category' => $category,
            'label' => $label,
            'window' => $window,
            'cutoff' => $cutoff,
            'schedule' => $schedule,
            'candidate_count' => $candidateCount,
            ...$this->runs->get($category),
        ];
    }
}
