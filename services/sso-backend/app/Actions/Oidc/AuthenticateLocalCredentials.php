<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\User;
use App\Services\Auth\LocalCredentialVerifier;
use App\Services\Auth\LoginAttemptThrottle;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\ConsentService;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\ScopePolicy;
use App\Support\Audit\AuthenticationAuditRecord;
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
        private readonly LocalCredentialVerifier $verifier,
        private readonly LoginAttemptThrottle $throttle,
        private readonly DownstreamClientRegistry $clients,
        private readonly ScopePolicy $scopes,
        private readonly AuthorizationCodeStore $codes,
        private readonly ConsentService $consents,
        private readonly RecordAuthenticationAuditEventAction $audits,
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

        if ($codeChallengeMethod !== 'S256') {
            return OidcErrorResponse::json('invalid_request', 'code_challenge_method must be S256.', 400);
        }

        // Resolve client
        $client = $this->clients->resolve($clientId, $redirectUri);

        if ($client === null) {
            return OidcErrorResponse::json('invalid_client', 'Unknown client or redirect URI.', 400);
        }

        // Check throttle
        if ($this->throttle->isThrottled($email)) {
            $this->recordFailed($request, $email, $client, 'account_throttled');

            return response()->json([
                'error' => 'too_many_attempts',
                'message' => 'Terlalu banyak percobaan login. Silakan coba lagi nanti.',
                'retry_after' => $this->throttle->availableIn($email),
            ], 429);
        }

        // Verify credentials
        $user = $this->verifier->verify($email, $password);

        if ($user === null) {
            $attempts = $this->throttle->recordFailure($email);
            $remaining = $this->throttle->remainingAttempts($email);
            $errorCode = $this->verifier->isLocked($email) ? 'account_locked' : 'invalid_credentials';

            $this->recordFailed($request, $email, $client, $errorCode);

            return response()->json([
                'error' => $errorCode,
                'message' => $errorCode === 'account_locked'
                    ? 'Akun Anda telah dikunci. Hubungi administrator.'
                    : 'Email atau password salah.',
                'remaining_attempts' => $remaining,
            ], 401);
        }

        // Success — clear throttle
        $this->throttle->clear($email);

        // FR-015 / UC-20: Check password expiry
        if ($this->isPasswordExpired($user)) {
            return response()->json([
                'error' => 'password_expired',
                'message' => 'Password Anda telah kedaluwarsa. Silakan ubah password.',
                'change_password_url' => '/profile/security',
            ], 403);
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
            'nonce' => $nonce !== '' ? $nonce : null,
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

        // FR-011: auto-grant consent for local login (user is authenticating directly)
        $scopeList = ScopeSet::fromString($validatedScope);
        if (! $client->skipConsent) {
            $this->consents->grant($user->subject_id, $client->clientId, $scopeList);
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

    /**
     * FR-015 / UC-20: Check if user's password has expired.
     */
    private function isPasswordExpired(User $user): bool
    {
        $maxAgeDays = (int) config('sso.auth.password_max_age_days', 90);

        if ($maxAgeDays <= 0) {
            return false;
        }

        // If password_changed_at is null, treat as expired (force initial change)
        if ($user->password_changed_at === null) {
            return true;
        }

        return $user->password_changed_at->diffInDays(now()) >= $maxAgeDays;
    }
}
