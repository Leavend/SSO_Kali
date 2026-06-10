<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Security\LoginRiskEvaluator;
use App\Services\Security\SuspiciousLoginNotifier;
use App\Support\Security\RiskLevel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

final class EvaluateLoginRiskNotificationJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public int $timeout = 10;

    public function __construct(
        public readonly int $userId,
        public readonly string $subjectId,
        public readonly string $ipAddress,
        public readonly string $userAgent,
        public readonly string $deviceFingerprint,
        public readonly bool $isNewIp,
        public readonly bool $isNewDevice,
    ) {
        $this->onQueue('notifications');
    }

    public function handle(LoginRiskEvaluator $riskEvaluator, SuspiciousLoginNotifier $notifier): void
    {
        $user = User::query()->find($this->userId);
        if (! $user instanceof User) {
            return;
        }

        $riskLevel = $riskEvaluator->evaluate(
            subjectId: $this->subjectId,
            ipAddress: $this->ipAddress,
            deviceFingerprint: $this->userAgent,
            isNewDevice: $this->isNewDevice,
            isNewIp: $this->isNewIp,
            recentLoginCount: $this->recentLoginCount(),
        );

        if ($riskLevel === RiskLevel::High) {
            $this->markCurrentContextMfaRequired();
        }

        if ($riskLevel === RiskLevel::High || $riskLevel === RiskLevel::Medium) {
            $notifier->notify($user, $this->subjectId, $this->ipAddress, $this->userAgent);
        }
    }

    /** @return list<string> */
    public function tags(): array
    {
        return [
            'login-risk-notification',
            'subject:'.$this->subjectId,
        ];
    }

    private function recentLoginCount(): int
    {
        $recentLogins = SsoSession::query()
            ->select('id')
            ->where('subject_id', $this->subjectId)
            ->where('authenticated_at', '>', now()->subHour())
            ->limit(LoginRiskEvaluator::VELOCITY_THRESHOLD + 1);

        return (int) DB::query()
            ->fromSub($recentLogins->toBase(), 'recent_logins')
            ->count();
    }

    private function markCurrentContextMfaRequired(): void
    {
        DB::table('login_contexts')
            ->where('subject_id', $this->subjectId)
            ->where('ip_address', $this->ipAddress)
            ->where('device_fingerprint', $this->deviceFingerprint)
            ->update([
                'mfa_required' => true,
                'updated_at' => now(),
            ]);
    }
}
