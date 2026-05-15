<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Actions\Auth\VerifyLocalPasswordLoginAction;
use App\Models\MfaCredential;
use App\Models\User;
use App\Services\Mfa\MfaChallengeStore;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\ConsentService;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\ScopePolicy;
use App\Support\Audit\AuthenticationAuditRecord;
use App\Support\Auth\LocalPasswordLoginOutcome;
use App\Support\Oidc\DownstreamClient;
use App\Support\Oidc\ScopeSet;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * FR-014: Authenticate user with local credentials (email + password).
 *
 * This is a parallel auth path alongside upstream OIDC.
 * On success: creates session context, issues authorization code, returns redirect URI.
 * On failure: returns error with remaining attempts info.
 */
final class AuthenticateLocalCredentials
{
    public function __construct(
        private readonly VerifyLocalPasswordLoginAction $verifier,
        private readonly DownstreamClientRegistry $clients,
        private readonly ScopePolicy $scopes,
        private readonly AuthorizationCodeStore $codes,
        private readonly AuthRequestStore $authRequests,
        private readonly ConsentService $consents,
        private readonly RecordAuthenticationAuditEventAction $audits,
        private readonly MfaChallengeStore $challenges,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $email = (string) $request->input('email', '');
        $password = (string) $request->input('password', '');
        $clientId = (string) $request->input('client_id', '');
        $redirectUri = (string) $request->input('redirect_uri', '');
        $codeChallenge = (string) $request->input('code_challenge', '');
        $codeChallengeMethod = (string) $request->input('code_challenge_method', '');
        $state = (string) $request->input('state', '');
        $nonce = (string) $request->input('nonce', '');
        $scope = (string) $request->input('scope', 'openid');

        // Validate required fields
        if ($email === '' || $password === '') {
            return OidcErrorResponse::json('invalid_request', 'Email and password are required.', 400);
        }

        if ($clientId === '' || $redirectUri === '' || $codeChallenge === '' || $state === '') {
            return OidcErrorResponse::json('invalid_request', 'client_id, redirect_uri, code_challenge, and state are required.', 400);
        }

        if ($nonce === '') {
            return OidcErrorResponse::json('invalid_request', 'nonce is required.', 400);
        }

        if ($codeChallengeMethod !== 'S256') {
            return OidcErrorResponse::json('invalid_request', 'code_challenge_method must be S256.', 400);
        }

        // Resolve client
        $client = $this->clients->resolve($clientId, $redirectUri);

        if ($client === null) {
            return OidcErrorResponse::json('invalid_client', 'Unknown client or redirect URI.', 400);
        }

        $verification = $this->verifier->execute($email, $password);

        if ($verification->outcome === LocalPasswordLoginOutcome::TooManyAttempts) {
            $this->recordFailed($request, $email, $client, $verification->outcome->value);

            return response()->json([
                'error' => 'too_many_attempts',
                'message' => 'Terlalu banyak percobaan login. Silakan coba lagi nanti.',
                'retry_after' => $verification->retryAfter,
            ], 429, ['Retry-After' => (string) $verification->retryAfter]);
        }

        if ($verification->outcome === LocalPasswordLoginOutcome::PasswordExpired) {
            $this->recordFailed($request, $email, $client, $verification->outcome->value);

            return response()->json([
                'error' => 'password_expired',
                'message' => 'Password Anda telah kedaluwarsa. Silakan ubah password.',
                'change_password_url' => '/profile/security',
            ], 403);
        }

        if (! $verification->authenticated() || $verification->user === null) {
            $errorCode = $verification->outcome->value;
            $this->recordFailed($request, $email, $client, $errorCode);

            return response()->json([
                'error' => $errorCode,
                'message' => $errorCode === 'account_locked'
                    ? 'Akun Anda telah dikunci. Hubungi administrator.'
                    : 'Email atau password salah.',
                'remaining_attempts' => $verification->remainingAttempts,
            ], 401);
        }

        $user = $verification->user;

        // FR-019 / UC-67: Check if user has MFA enrolled — require challenge
        if ($this->requiresMfaChallenge($user)) {
            $challenge = $this->challenges->create($user->getKey());

            return response()->json([
                'mfa_required' => true,
                'challenge' => [
                    'challenge_id' => $challenge['challenge_id'],
                    'methods_available' => ['totp', 'recovery_code'],
                    'expires_at' => $challenge['expires_at'],
                ],
                // Preserve OIDC context for post-MFA code issuance
                'oidc_context' => [
                    'client_id' => $clientId,
                    'redirect_uri' => $redirectUri,
                    'code_challenge' => $codeChallenge,
                    'state' => $state,
                    'nonce' => $nonce,
                    'scope' => $scope,
                ],
            ]);
        }

        // Validate scope
        try {
            $validatedScope = $this->scopes->validateAuthorizationRequest($scope, $client);
        } catch (\RuntimeException) {
            $validatedScope = 'openid';
        }

        // Build authorization code payload
        $payload = [
            'client_id' => $client->clientId,
            'redirect_uri' => $redirectUri,
            'scope' => $validatedScope,
            'nonce' => $nonce,
            'original_state' => $state,
            'downstream_code_challenge' => $codeChallenge,
            'session_id' => (string) Str::uuid(),
            'subject_id' => $user->subject_id,
            'auth_time' => time(),
            'amr' => ['pwd'],
            'acr' => 'urn:sso:loa:password',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ];

        if ($this->requiresConsent($client, $user->subject_id, $validatedScope)) {
            $consentState = $this->authRequests->put($payload);

            if ($consentState === null) {
                return OidcErrorResponse::json('temporarily_unavailable', 'The consent session could not be started.', 503);
            }

            return response()->json([
                'redirect_uri' => $this->consentRedirectUri($client, $validatedScope, $consentState),
            ]);
        }

        // Issue authorization code
        $code = $this->codes->issue($payload);

        // Record success
        $this->recordSuccess($request, $user, $client, $payload);

        // Return redirect URI with code
        $query = http_build_query(array_filter([
            'code' => $code,
            'state' => $state,
            'iss' => config('sso.issuer'),
        ]));

        $callbackUri = $redirectUri.(str_contains($redirectUri, '?') ? '&' : '?').$query;

        return response()->json([
            'redirect_uri' => $callbackUri,
        ]);
    }

    private function requiresConsent(DownstreamClient $client, string $subjectId, string $scope): bool
    {
        if ($client->skipConsent) {
            return false;
        }

        return ! $this->consents->hasConsent($subjectId, $client->clientId, ScopeSet::fromString($scope));
    }

    private function consentRedirectUri(DownstreamClient $client, string $scope, string $state): string
    {
        $frontendUrl = rtrim((string) config('sso.frontend_url', ''), '/');

        return $frontendUrl.'/auth/consent?'.http_build_query([
            'client_id' => $client->clientId,
            'scope' => $scope,
            'state' => $state,
        ]);
    }

    /**
     * FR-019: Check if user has a verified MFA credential requiring challenge.
     */
    private function requiresMfaChallenge(User $user): bool
    {
        return MfaCredential::query()
            ->forUser($user->getKey())
            ->totp()
            ->verified()
            ->exists();
    }

    private function recordFailed(Request $request, string $email, DownstreamClient $client, string $errorCode): void
    {
        $this->audits->execute(AuthenticationAuditRecord::authorizationRequestRejected(
            clientId: $client->clientId,
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
            errorCode: $errorCode,
            requestId: $request->headers->get('X-Request-Id'),
            context: [
                'auth_method' => 'local_password',
                'email_hash' => hash('sha256', mb_strtolower($email)),
                'error' => $errorCode,
            ],
        ));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function recordSuccess(Request $request, User $user, DownstreamClient $client, array $payload): void
    {
        $this->audits->execute(AuthenticationAuditRecord::authorizationRequestAccepted(
            clientId: $client->clientId,
            sessionId: $payload['session_id'] ?? null,
            subjectId: $user->subject_id,
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
            requestId: $request->headers->get('X-Request-Id'),
            context: [
                'auth_method' => 'local_password',
                'decision' => 'local_login_success',
                'scope' => $payload['scope'] ?? 'openid',
            ],
        ));
    }
}
