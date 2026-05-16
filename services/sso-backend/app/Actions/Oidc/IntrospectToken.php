<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\OidcIncidentAuditLogger;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Oidc\TokenClientAuthenticationResolver;
use App\Support\Audit\AuthenticationAuditRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * RFC 7662 OAuth 2.0 Token Introspection.
 *
 * Authenticated client (HTTP Basic or body) can submit an opaque or JWT
 * token plus optional `token_type_hint` to learn whether it is currently
 * active. Unknown / expired / revoked / wrongly-audienced tokens map to
 * the canonical `{active:false}` response so callers cannot use this
 * endpoint as a token oracle.
 */
final class IntrospectToken
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly TokenClientAuthenticationResolver $clientAuthentication,
        private readonly AccessTokenGuard $accessTokens,
        private readonly RefreshTokenStore $refreshTokens,
        private readonly OidcIncidentAuditLogger $incidents,
        private readonly RecordAuthenticationAuditEventAction $audits,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $credentials = $this->clientAuthentication->resolve($request);
        $client = $credentials->clientId === '' ? null : $this->clients->find($credentials->clientId);

        if ($client === null || ! $this->clients->validSecret($client, $credentials->clientSecret)) {
            $this->incidents->record('oidc_introspection_invalid_client', $request, $client === null ? 'unknown_client' : 'invalid_secret', [
                'client_id' => $credentials->clientId,
                'auth_method' => $credentials->authMethod,
            ]);

            return new JsonResponse([
                'error' => 'invalid_client',
                'error_description' => 'Client authentication failed.',
            ], 401, [
                'WWW-Authenticate' => 'Basic realm="introspection"',
            ]);
        }

        $token = (string) $request->input('token', '');
        $hint = $this->normaliseHint($request->input('token_type_hint'));

        if ($token === '') {
            return $this->inactiveResponse($request, $client->clientId, 'missing_token', $hint, $token);
        }

        $shape = $this->lookup($token, $hint, $client->clientId);

        if ($shape === null) {
            return $this->inactiveResponse($request, $client->clientId, 'token_inactive', $hint, $token);
        }

        $this->recordAudit($request, $client->clientId, 'succeeded', null, $hint, $token, true);

        return new JsonResponse($shape);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function lookup(string $token, ?string $hint, string $callerClientId): ?array
    {
        // Hint optimisation only — RFC 7662 §2.1 mandates lookup must still
        // succeed if the hint turns out to be wrong.
        if ($hint !== 'refresh_token') {
            $access = $this->lookupAccess($token, $callerClientId);

            if ($access !== null) {
                return $access;
            }
        }

        if ($hint !== 'access_token') {
            $refresh = $this->lookupRefresh($token, $callerClientId);

            if ($refresh !== null) {
                return $refresh;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function lookupAccess(string $token, string $callerClientId): ?array
    {
        try {
            $claims = $this->accessTokens->claimsFrom($token);
        } catch (Throwable) {
            return null;
        }

        // RFC 7662 §2.2: introspection responses must not over-disclose to a
        // caller that does not own the token.
        if ((string) $claims['client_id'] !== $callerClientId) {
            return null;
        }

        $payload = [
            'active' => true,
            'token_type' => 'Bearer',
            'iss' => (string) ($claims['iss'] ?? ''),
            'aud' => $claims['aud'] ?? null,
            'sub' => (string) $claims['sub'],
            'sid' => (string) $claims['sid'],
            'client_id' => (string) $claims['client_id'],
            'jti' => (string) $claims['jti'],
            'iat' => (int) $claims['iat'],
            'exp' => (int) $claims['exp'],
            'token_use' => 'access',
        ];

        if (is_string($claims['scope'] ?? null) && $claims['scope'] !== '') {
            $payload['scope'] = $claims['scope'];
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function lookupRefresh(string $token, string $callerClientId): ?array
    {
        $record = $this->refreshTokens->findActive($token, $callerClientId);

        if ($record === null) {
            return null;
        }

        return [
            'active' => true,
            'token_type' => 'refresh_token',
            'iss' => (string) config('sso.issuer'),
            'sub' => (string) $record['subject_id'],
            'sid' => (string) $record['session_id'],
            'client_id' => (string) $record['client_id'],
            'scope' => (string) ($record['scope'] ?? ''),
            'token_use' => 'refresh',
        ];
    }

    private function inactiveResponse(Request $request, string $clientId, string $reason, ?string $hint, string $token): JsonResponse
    {
        $this->recordAudit($request, $clientId, 'denied', $reason, $hint, $token, false);

        return new JsonResponse(['active' => false]);
    }

    private function recordAudit(Request $request, string $clientId, string $outcome, ?string $errorCode, ?string $hint, string $token, bool $active): void
    {
        $context = [
            'token_type_hint' => $hint,
            'token_hash' => $token === '' ? null : hash('sha256', $token),
            'introspection_active' => $active,
        ];

        $this->audits->execute(AuthenticationAuditRecord::tokenLifecycle(
            eventType: 'token_introspected',
            outcome: $outcome,
            subjectId: null,
            clientId: $clientId,
            sessionId: null,
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
            errorCode: $errorCode,
            requestId: $request->headers->get('X-Request-Id'),
            context: array_filter($context, static fn (mixed $value): bool => $value !== null),
        ));
    }

    private function normaliseHint(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }
}
