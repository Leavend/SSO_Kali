<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\ConsentService;
use App\Support\Audit\AuthenticationAuditRecord;
use App\Support\Oidc\ScopeSet;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * FR-011 / ISSUE-03: Process user consent decision.
 *
 * Receives the user's allow/deny decision from the consent UI.
 * - Allow: persists consent, issues authorization code, returns redirect URI
 * - Deny: returns access_denied error redirect
 */
final class ProcessConsentDecision
{
    public function __construct(
        private readonly AuthRequestStore $authRequests,
        private readonly AuthorizationCodeStore $codes,
        private readonly ConsentService $consents,
        private readonly RecordAuthenticationAuditEventAction $audits,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $state = (string) $request->input('state', '');
        $decision = (string) $request->input('decision', '');

        if ($state === '' || ! in_array($decision, ['allow', 'deny'], true)) {
            return OidcErrorResponse::json('invalid_request', 'state and decision (allow/deny) are required.', 400);
        }

        $payload = $this->authRequests->pull($state);

        if ($payload === null) {
            return OidcErrorResponse::json('invalid_request', 'Consent session expired or invalid.', 400);
        }

        $clientId = (string) ($payload['client_id'] ?? '');
        $subjectId = (string) ($payload['subject_id'] ?? '');
        $scope = (string) ($payload['scope'] ?? 'openid');
        $redirectUri = (string) ($payload['redirect_uri'] ?? '');

        if ($decision === 'deny') {
            $this->recordDecision($request, $payload, 'failed', 'access_denied');

            return response()->json([
                'redirect_uri' => $this->denyRedirect($redirectUri, $payload),
            ]);
        }

        // Persist consent
        $this->consents->grant($subjectId, $clientId, ScopeSet::fromString($scope));
        $this->recordDecision($request, $payload, 'succeeded');

        // Issue authorization code
        $code = $this->codes->issue($payload);

        $query = http_build_query(array_filter([
            'code' => $code,
            'state' => $payload['original_state'] ?? null,
            'iss' => config('sso.issuer'),
        ]));

        $callbackUri = $redirectUri.(str_contains($redirectUri, '?') ? '&' : '?').$query;

        return response()->json([
            'redirect_uri' => $callbackUri,
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function recordDecision(Request $request, array $payload, string $outcome, ?string $errorCode = null): void
    {
        $this->audits->execute(AuthenticationAuditRecord::consentDecision(
            outcome: $outcome,
            subjectId: (string) ($payload['subject_id'] ?? ''),
            clientId: (string) ($payload['client_id'] ?? ''),
            sessionId: is_string($payload['session_id'] ?? null) ? $payload['session_id'] : null,
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
            errorCode: $errorCode,
            requestId: $request->headers->get('X-Request-Id'),
            context: [
                'scope' => (string) ($payload['scope'] ?? 'openid'),
                'decision' => $outcome === 'succeeded' ? 'allow' : 'deny',
            ],
        ));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function denyRedirect(string $redirectUri, array $payload): string
    {
        $query = http_build_query(array_filter([
            'error' => 'access_denied',
            'error_description' => 'The user denied the consent request.',
            'state' => $payload['original_state'] ?? null,
        ]));

        return $redirectUri.(str_contains($redirectUri, '?') ? '&' : '?').$query;
    }
}
