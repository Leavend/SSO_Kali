<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\ConsentService;
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
            return response()->json([
                'redirect_uri' => $this->denyRedirect($redirectUri, $payload),
            ]);
        }

        // Persist consent
        $this->consents->grant($subjectId, $clientId, ScopeSet::fromString($scope));

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
