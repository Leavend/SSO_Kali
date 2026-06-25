<?php

declare(strict_types=1);

namespace App\Services\Mfa;

/**
 * Outcome of recording a single MFA verification attempt.
 *
 * Replaces the previous boolean return of MfaChallengeStore::incrementAttempt,
 * which conflated three distinct failure modes (not found, expired, and
 * max-attempts) into one `false`, forcing the caller to surface a misleading
 * "maximum attempts exceeded" message for a challenge that had simply expired.
 */
enum MfaAttemptOutcome
{
    case Recorded;
    case Expired;
    case NotFound;
    case MaxAttemptsReached;
}
