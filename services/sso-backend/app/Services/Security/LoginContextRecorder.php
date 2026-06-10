<?php

declare(strict_types=1);

namespace App\Services\Security;

use App\Jobs\EvaluateLoginRiskNotificationJob;
use App\Models\SsoSession;
use App\Models\User;
use App\Support\Security\RiskLevel;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

final class LoginContextRecorder
{
    public function __construct(
        private readonly LoginRiskEvaluator $riskEvaluator,
        private readonly SuspiciousLoginNotifier $notifier,
    ) {}

    /**
     * Record the login context for a user.
     *
     * @param  array<string>  $amr
     */
    public function record(
        User $user,
        ?string $ipAddress,
        ?string $userAgent,
        array $amr = [],
        ?string $acr = null,
        mixed $authTime = null,
        bool $evaluateRiskInline = true,
    ): void {
        $observedAt = now();
        $subjectId = $user->subject_id;
        $ip = $ipAddress ?? '127.0.0.1';
        $ua = $userAgent ?? 'unknown-device';
        $fingerprint = hash('sha256', $ua);

        $existing = DB::table('login_contexts')
            ->where('subject_id', $subjectId)
            ->first();

        $isNewIp = true;
        $isNewDevice = false;

        if ($existing !== null) {
            $isNewIp = $existing->ip_address !== $ip;
            $isNewDevice = $existing->device_fingerprint !== $fingerprint;
        }

        $riskLevel = null;
        $mfaRequired = (bool) $user->mfa_mandatory;

        if ($evaluateRiskInline) {
            $riskLevel = $this->evaluateRisk($subjectId, $ip, $ua, $isNewDevice, $isNewIp);
            $mfaRequired = $mfaRequired || $riskLevel === RiskLevel::High;
        }

        // Parse authTime
        $parsedAuthTime = null;
        if (is_int($authTime)) {
            $parsedAuthTime = now()->setTimestamp($authTime);
        } elseif (is_string($authTime)) {
            $parsedAuthTime = ctype_digit($authTime) ? now()->setTimestamp((int) $authTime) : now();
        } elseif ($authTime instanceof \DateTimeInterface) {
            $parsedAuthTime = $authTime;
        } else {
            $parsedAuthTime = now();
        }

        DB::table('login_contexts')->updateOrInsert(
            ['subject_id' => $subjectId],
            [
                'subject_uuid' => $subjectId,
                'ip_address' => $ip,
                'device_fingerprint' => $fingerprint,
                'mfa_required' => $mfaRequired,
                'auth_time' => $parsedAuthTime,
                'amr' => json_encode(array_values($amr)),
                'acr' => $acr,
                'last_seen_at' => $observedAt,
                'updated_at' => $observedAt,
                'created_at' => $observedAt,
            ]
        );

        $user->forceFill(['last_login_at' => $observedAt])->save();

        if ($evaluateRiskInline) {
            if ($riskLevel === RiskLevel::High || $riskLevel === RiskLevel::Medium) {
                $this->notifier->notify($user, $subjectId, $ip, $ua);
            }

            return;
        }

        $this->queueRiskEvaluation($user, $subjectId, $ip, $ua, $fingerprint, $isNewIp, $isNewDevice);
    }

    private function evaluateRisk(string $subjectId, string $ipAddress, string $userAgent, bool $isNewDevice, bool $isNewIp): RiskLevel
    {
        return $this->riskEvaluator->evaluate(
            subjectId: $subjectId,
            ipAddress: $ipAddress,
            deviceFingerprint: $userAgent,
            isNewDevice: $isNewDevice,
            isNewIp: $isNewIp,
            recentLoginCount: $this->recentLoginCount($subjectId),
        );
    }

    private function recentLoginCount(string $subjectId): int
    {
        $recentLogins = SsoSession::query()
            ->select('id')
            ->where('subject_id', $subjectId)
            ->where('authenticated_at', '>', now()->subHour())
            ->limit(LoginRiskEvaluator::VELOCITY_THRESHOLD + 1);

        return (int) DB::query()
            ->fromSub($recentLogins->toBase(), 'recent_logins')
            ->count();
    }

    private function queueRiskEvaluation(
        User $user,
        string $subjectId,
        string $ipAddress,
        string $userAgent,
        string $deviceFingerprint,
        bool $isNewIp,
        bool $isNewDevice,
    ): void {
        try {
            Bus::dispatch(new EvaluateLoginRiskNotificationJob(
                userId: (int) $user->getKey(),
                subjectId: $subjectId,
                ipAddress: $ipAddress,
                userAgent: $userAgent,
                deviceFingerprint: $deviceFingerprint,
                isNewIp: $isNewIp,
                isNewDevice: $isNewDevice,
            ));
        } catch (\Throwable $exception) {
            Log::error('[LOGIN_RISK_EVALUATION_QUEUE_FAILED]', [
                'subject_id' => $subjectId,
                'ip_address' => $ipAddress,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
