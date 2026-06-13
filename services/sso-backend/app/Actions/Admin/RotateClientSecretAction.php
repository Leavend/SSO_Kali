<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretIssuer;
use DomainException;
use Illuminate\Http\Request;

/**
 * FR-009 / UC-61 — Rotate a confidential client's secret.
 *
 * Behavior:
 *   - Rejects if the registration does not exist (404 at controller level).
 *   - Rejects public clients (they have no secret by definition).
 *   - Generates a new random plaintext ({@see plaintextLength()} chars).
 *   - Hashes it via the Argon2id policy.
 *   - Updates secret_hash, secret_rotated_at (now), secret_expires_at
 *     (now + configured TTL).
 *   - Flushes DownstreamClientRegistry cache so the next token exchange
 *     uses the new hash.
 *   - Records a CLIENT_SECRET_ROTATED audit event.
 *   - Returns the plaintext ONCE so the caller can deliver it securely.
 *     The plaintext is never stored or logged.
 *
 * Grace-period dual-secret handling (old secret still accepted for N minutes
 * after rotation) is deferred to a future phase — it needs additional schema
 * (secret_hash_previous, secret_previous_expires_at) and lifecycle handling
 * at the token endpoint.
 */
final class RotateClientSecretAction
{
    public function __construct(
        private readonly ClientSecretIssuer $secrets,
        private readonly DownstreamClientRegistry $clients,
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @return array{plaintext_once: string, rotated_at: string, expires_at: string, client_id: string}
     */
    public function execute(Request $request, User $admin, string $clientId): array
    {
        $registration = $this->findRegistration($clientId);
        $this->assertRotatable($registration);

        $secret = $this->secrets->issue();

        $registration->forceFill([
            'secret_hash' => $secret->hash,
            'secret_rotated_at' => $secret->issuedAt,
            'secret_expires_at' => $secret->expiresAt,
        ])->save();

        $this->clients->flush();

        $this->audit->succeeded(
            'rotate_client_secret',
            $request,
            $admin,
            [
                'client_id' => $registration->client_id,
                'rotated_at' => $secret->issuedAt->toIso8601String(),
                'expires_at' => $secret->expiresAt->toIso8601String(),
            ],
            AdminAuditTaxonomy::CLIENT_SECRET_ROTATED,
        );

        return [
            'plaintext_once' => $secret->plaintext,
            'plaintext_secret' => $secret->plaintext,
            'rotated_at' => $secret->issuedAt->toIso8601String(),
            'expires_at' => $secret->expiresAt->toIso8601String(),
            'client_id' => $registration->client_id,
        ];
    }

    private function findRegistration(string $clientId): OidcClientRegistration
    {
        $registration = OidcClientRegistration::query()->where('client_id', $clientId)->first();

        if (! $registration instanceof OidcClientRegistration) {
            throw new DomainException('Client registration not found.', 404);
        }

        return $registration;
    }

    private function assertRotatable(OidcClientRegistration $registration): void
    {
        if ($registration->type !== 'confidential') {
            throw new DomainException(
                'Only confidential clients have a secret to rotate.',
                422,
            );
        }
    }
}
