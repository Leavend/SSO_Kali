<?php

declare(strict_types=1);

namespace App\Services\Security;

use App\Models\SsoSession;
use App\Models\User;
use App\Notifications\SuspiciousLoginNotification;
use App\Support\Security\RiskLevel;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class LoginContextRecorder
{
    public function __construct(
        private readonly LoginRiskEvaluator $riskEvaluator
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
        mixed $authTime = null
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

        $recentLoginCount = SsoSession::query()
            ->where('subject_id', $subjectId)
            ->where('authenticated_at', '>', now()->subHour())
            ->count();

        $riskLevel = $this->riskEvaluator->evaluate(
            subjectId: $subjectId,
            ipAddress: $ip,
            deviceFingerprint: $ua,
            isNewDevice: $isNewDevice,
            isNewIp: $isNewIp,
            recentLoginCount: $recentLoginCount
        );

        if ($riskLevel === RiskLevel::High || $riskLevel === RiskLevel::Medium) {
            $cacheKey = 'suspicious_login_notified:'.$subjectId;
            if (! Cache::has($cacheKey)) {
                $window = (int) config('security-notifications.throttle.window_minutes', 60);
                Cache::put($cacheKey, true, now()->addMinutes($window));

                $user->notify(new SuspiciousLoginNotification(
                    ipAddress: $ip,
                    userAgent: $ua,
                    occurredAt: time()
                ));
            }
        }

        $mfaRequired = $user->mfa_mandatory || $riskLevel === RiskLevel::High;

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
    }
}
