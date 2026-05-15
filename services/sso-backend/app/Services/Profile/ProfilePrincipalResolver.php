<?php

declare(strict_types=1);

namespace App\Services\Profile;

use App\Models\User;
use App\Services\Directory\DirectoryUserProvider;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use App\Support\Oidc\OidcScope;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Resolves the authenticated subject for the first-party profile
 * portal. Accepts either:
 *
 *   1. An OAuth access token presented as Bearer — preserves the
 *      existing API client contract and scoped claims.
 *   2. An SSO session cookie — for the first-party portal SPA which
 *      runs under the SSO domain and never issues a bearer to itself.
 *
 * Returning a uniform {user, claims} shape lets downstream presenters
 * (ProfilePortalPresenter, UserSessionsService, etc.) stay ignorant
 * of which credential was used.
 *
 * When the subject is resolved via session, synthetic claims are
 * produced with the default portal scopes so presenters surface the
 * fields the UI expects. This is safe because first-party session
 * cookies already represent the full user context — we're not
 * widening the scope surface beyond what the portal itself is
 * trusted to see.
 */
final class ProfilePrincipalResolver
{
    /**
     * Default scopes synthesized for cookie-authenticated principals.
     * Matches the portal's OIDC client default so JSON shape is
     * identical between the two auth paths.
     */
    private const PORTAL_SCOPES = [
        OidcScope::OPENID,
        OidcScope::PROFILE,
        OidcScope::EMAIL,
        OidcScope::ROLES,
        OidcScope::PERMISSIONS,
    ];

    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessions,
        private readonly DirectoryUserProvider $directory,
    ) {}

    /**
     * Resolve the principal from the request.
     *
     * @return array{user: User, claims: array<string, mixed>, source: 'bearer'|'session'}
     *
     * @throws ProfilePrincipalException when neither credential is present or valid,
     *                                   or when the user must re-enroll MFA after
     *                                   an admin-initiated lost-factor reset.
     */
    public function resolve(Request $request): array
    {
        $bearer = (string) $request->bearerToken();
        if ($bearer !== '') {
            $resolved = $this->fromBearer($bearer);
            $this->guardMfaReenrollment($resolved['user']);

            return $resolved;
        }

        $cookieSession = $this->fromSession($request);
        if ($cookieSession !== null) {
            $this->guardMfaReenrollment($cookieSession['user']);

            return $cookieSession;
        }

        throw new ProfilePrincipalException('invalid_token', 'Authentication required.');
    }

    /**
     * BE-FR020-001 — lost-factor MFA recovery enforcement.
     *
     * After an admin emergency reset, every privileged self-service
     * endpoint MUST refuse the user until they finish a fresh enrolment.
     * The MFA enrolment surface lives on `/api/mfa/*` and bypasses this
     * resolver entirely (see `EnsureMfaReenrollmentCompleted`), so it is
     * safe to gate all callers of `ProfilePrincipalResolver` here.
     *
     * @throws ProfilePrincipalException
     */
    private function guardMfaReenrollment(User $user): void
    {
        if (! $user->mfa_reset_required) {
            return;
        }

        throw new ProfilePrincipalException(
            'mfa_reenrollment_required',
            'Akun Anda telah direset oleh admin. Aktifkan kembali autentikasi multi-faktor (MFA) sebelum melanjutkan.',
            statusCode: 403,
        );
    }

    /**
     * @return array{user: User, claims: array<string, mixed>, source: 'bearer'}
     *
     * @throws ProfilePrincipalException on invalid/expired/revoked tokens.
     */
    private function fromBearer(string $token): array
    {
        try {
            $claims = $this->tokens->claimsFrom($token);
        } catch (RuntimeException) {
            throw new ProfilePrincipalException('invalid_token', 'The bearer token is invalid.');
        }

        $subject = (string) ($claims['sub'] ?? '');
        $user = User::query()->where('subject_id', $subject)->first();

        if (! $user instanceof User) {
            throw new ProfilePrincipalException('invalid_token', 'Subject not found.');
        }

        return ['user' => $user, 'claims' => $claims, 'source' => 'bearer'];
    }

    /**
     * @return array{user: User, claims: array<string, mixed>, source: 'session'}|null
     */
    private function fromSession(Request $request): ?array
    {
        $sessionId = $this->cookies->resolve($request);
        $user = $this->sessions->currentUser($sessionId);

        if (! $user instanceof User) {
            return null;
        }

        $roles = $this->directory->rolesFor($user->subject_id);
        $permissions = $user->roles()
            ->with('permissions')
            ->get()
            ->flatMap(fn ($role) => $role->permissions->pluck('slug'))
            ->unique()
            ->values()
            ->all();

        return [
            'user' => $user,
            'claims' => [
                'sub' => $user->subject_id,
                'scope' => implode(' ', self::PORTAL_SCOPES),
                'roles' => $roles,
                'permissions' => $permissions,
            ],
            'source' => 'session',
        ];
    }
}
