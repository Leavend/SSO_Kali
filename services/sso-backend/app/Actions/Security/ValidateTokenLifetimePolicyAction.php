<?php

declare(strict_types=1);

namespace App\Actions\Security;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Support\Audit\AuthenticationAuditRecord;
use App\Support\Security\TokenLifetimePolicy;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;

/**
 * BE-FR038-001 — Token lifetime policy validator + version emitter.
 *
 * - Returns a structured validation result `{ valid, policy,
 *   fingerprint, violations[] }` for the deploy guard command and
 *   service provider boot hook.
 * - On fingerprint change, records an `authentication_audit_events`
 *   row tagged `token_lifetime_policy_changed` so policy rotations
 *   are versioned and historically observable, satisfying FR-038's
 *   "policy changes audited/versioned" acceptance criterion.
 */
final readonly class ValidateTokenLifetimePolicyAction
{
    private const FINGERPRINT_CACHE_KEY = 'sso:fr038:token-lifetime-policy:fingerprint';

    public function __construct(
        private RecordAuthenticationAuditEventAction $audit,
    ) {}

    /**
     * @return array{
     *   valid: bool,
     *   policy: array<string, int>,
     *   fingerprint: string,
     *   violations: list<string>,
     *   environment: string,
     * }
     */
    public function execute(): array
    {
        $policy = TokenLifetimePolicy::fromConfig((array) Config::get('sso.ttl', []));
        $violations = $policy->violations();
        $fingerprint = $policy->fingerprint();

        $this->emitVersionAuditWhenChanged($policy, $fingerprint);

        return [
            'valid' => $violations === [],
            'policy' => $policy->snapshot(),
            'fingerprint' => $fingerprint,
            'violations' => $violations,
            'environment' => (string) Config::get('app.env', 'production'),
        ];
    }

    private function emitVersionAuditWhenChanged(TokenLifetimePolicy $policy, string $fingerprint): void
    {
        $previous = Cache::get(self::FINGERPRINT_CACHE_KEY);

        if (is_string($previous) && $previous === $fingerprint) {
            return;
        }

        Cache::forever(self::FINGERPRINT_CACHE_KEY, $fingerprint);

        $this->audit->execute(AuthenticationAuditRecord::tokenLifecycle(
            eventType: 'token_lifetime_policy_changed',
            outcome: 'recorded',
            subjectId: null,
            clientId: null,
            sessionId: null,
            ipAddress: null,
            userAgent: null,
            errorCode: null,
            requestId: null,
            context: [
                'policy' => $policy->snapshot(),
                'fingerprint' => $fingerprint,
                'previous_fingerprint' => is_string($previous) ? $previous : null,
            ],
        ));
    }
}
