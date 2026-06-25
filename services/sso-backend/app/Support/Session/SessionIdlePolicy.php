<?php

declare(strict_types=1);

namespace App\Support\Session;

use App\Models\SsoSession;
use Carbon\CarbonImmutable;
use DateTimeInterface;

/**
 * Single source of truth for "is this SSO session idle?".
 *
 * Idle is measured from the session's last *deliberate activity*
 * (activity_seen_at), falling back to the passive last_seen_at heartbeat and
 * finally to authenticated_at. Both the session-resolution path
 * (SsoSessionService) and the account-switch path (DeviceSessionRegistry) share
 * this predicate so the idle definition can never drift between them.
 */
final class SessionIdlePolicy
{
    /**
     * Defensive fallback only. `config/sso.php` (`sso.session.idle_minutes`) is
     * the canonical default and always resolves; this constant guards the
     * theoretical case of an unloaded config and must mirror that value.
     */
    private const int DEFAULT_IDLE_MINUTES = 30;

    public function isIdle(SsoSession $session): bool
    {
        $idleMinutes = (int) config('sso.session.idle_minutes', self::DEFAULT_IDLE_MINUTES);

        if ($idleMinutes <= 0) {
            return false;
        }

        return $this->lastActivityAt($session)->addMinutes($idleMinutes)->isPast();
    }

    private function lastActivityAt(SsoSession $session): CarbonImmutable
    {
        $activity = $session->activity_seen_at instanceof DateTimeInterface
            ? $session->activity_seen_at
            : $session->last_seen_at;

        return $activity instanceof DateTimeInterface
            ? CarbonImmutable::instance($activity)
            : CarbonImmutable::instance($session->authenticated_at);
    }
}
