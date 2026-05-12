<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\SsoErrors\BuildSsoErrorRedirectAction;
use App\Actions\SsoErrors\RecordSsoErrorAction;
use App\Enums\SsoErrorCode;
use App\Services\Oidc\AuthContextFactory;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Oidc\SsoBrowserSession;
use App\Services\Oidc\Upstream\UpstreamOidcClient;
use App\Services\Oidc\Upstream\UpstreamOidcTokenVerifier;
use App\Services\Oidc\UpstreamCallbackSuccessLogger;
use App\Services\Oidc\UserProfileSynchronizer;
use App\Support\Oidc\SsoAuthFlowCookie;
use App\Support\SsoErrors\SsoErrorContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

final class HandleUpstreamCallback
{
    public function __construct(
        private readonly AuthRequestStore $authRequests,
        private readonly AuthorizationCodeStore $codes,
        private readonly AuthContextFactory $authContext,
        private readonly UpstreamOidcClient $upstream,
        private readonly UpstreamOidcTokenVerifier $verifier,
        private readonly UserProfileSynchronizer $profiles,
        private readonly LogicalSessionStore $sessions,
        private readonly SsoAuthFlowCookie $authFlowCookie,
        private readonly SsoBrowserSession $browserSession,
        private readonly UpstreamCallbackSuccessLogger $successLogger,
        private readonly RecordSsoErrorAction $ssoErrors,
        private readonly BuildSsoErrorRedirectAction $errorRedirects,
    ) {}

    public function handle(Request $request): JsonResponse|RedirectResponse
    {
        $context = $this->authRequests->pull((string) $request->query('state', ''));

        if ($context === null) {
            return $this->missingContextResponse($request);
        }

        if (is_string($request->query('error'))) {
            return $this->clearAuthFlowCookie(
                redirect()->away($this->frontendErrorRedirect(
                    code: $this->upstreamErrorCode((string) $request->query('error')),
                    safeReason: 'upstream_callback_error',
                    technicalReason: (string) $request->query('error_description', 'Authentication failed upstream.'),
                    request: $request,
                    context: $context,
                    retryAllowed: $this->upstreamErrorCode((string) $request->query('error')) === SsoErrorCode::TemporarilyUnavailable,
                    alternativeLoginAllowed: $this->upstreamErrorCode((string) $request->query('error')) === SsoErrorCode::TemporarilyUnavailable,
                ))
            );
        }

        return $this->clearAuthFlowCookie($this->completeAuthorization($request, $context));
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function completeAuthorization(Request $request, array $context): RedirectResponse
    {
        try {
            [$tokens, $claims, $authContext] = $this->handshake($request, $context);
        } catch (Throwable $exception) {
            return $this->failureRedirect($context, $exception);
        }

        return $this->successRedirect($request, $context, $tokens, $claims, $authContext);
    }

    private function missingContextResponse(Request $request): JsonResponse|RedirectResponse
    {
        $context = $this->authFlowCookie->read($request);

        if ($context === null) {
            return $this->clearAuthFlowCookie(
                redirect()->away($this->frontendErrorRedirect(
                    code: SsoErrorCode::SessionExpired,
                    safeReason: 'missing_upstream_context',
                    technicalReason: 'No cache entry and no auth-flow cookie were available for upstream callback.',
                    request: $request,
                    context: [],
                ))
            );
        }

        return $this->clearAuthFlowCookie(
            redirect()->away($this->frontendErrorRedirect(
                code: SsoErrorCode::SessionExpired,
                safeReason: 'expired_upstream_context',
                technicalReason: 'The upstream authentication session expired before completion.',
                request: $request,
                context: $context,
            ))
        );
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{0: array<string, mixed>, 1: array<string, mixed>, 2: array<string, mixed>}
     */
    private function handshake(Request $request, array $context): array
    {
        $tokens = $this->exchangeTokens($request, $context);
        [$claims, $authContext] = $this->claims($tokens, $context);

        return [$tokens, $claims, $authContext];
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $authContext
     */
    private function successRedirect(
        Request $request,
        array $context,
        array $tokens,
        array $claims,
        array $authContext,
    ): RedirectResponse {
        $user = $this->profiles->sync($claims, [...$context, ...$authContext]);
        $logicalSessionId = $this->sessions->current($user->subject_id);
        $this->browserSession->remember($request, $user->subject_id, $logicalSessionId, $authContext);
        $code = $this->codes->issue($this->authorizationCodePayload(
            $context,
            $tokens,
            $user->subject_id,
            $logicalSessionId,
            $authContext,
        ));
        $this->successLogger->record(
            $context,
            $user->subject_id,
            $logicalSessionId,
            $authContext,
            is_string($tokens['refresh_token'] ?? null),
        );

        return redirect()->away($this->redirectUri((string) $context['redirect_uri'], $code, $context));
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function failureRedirect(array $context, Throwable $exception): RedirectResponse
    {
        Log::error('[OIDC_UPSTREAM_CALLBACK_FAILED]', [
            'error' => $exception->getMessage(),
            'trace' => $exception->getTraceAsString(),
            'redirect_uri' => (string) ($context['redirect_uri'] ?? ''),
            'client_id' => (string) ($context['client_id'] ?? ''),
            'original_state' => is_string($context['original_state'] ?? null) ? $context['original_state'] : null,
        ]);

        return redirect()->away($this->frontendErrorRedirect(
            code: SsoErrorCode::TemporarilyUnavailable,
            safeReason: 'upstream_handshake_failed',
            technicalReason: $exception->getMessage(),
            request: request(),
            context: $context,
            retryAllowed: true,
            alternativeLoginAllowed: true,
        ));
    }

    private function clearAuthFlowCookie(JsonResponse|RedirectResponse $response): JsonResponse|RedirectResponse
    {
        return $response->withCookie($this->authFlowCookie->expire());
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function exchangeTokens(Request $request, array $context): array
    {
        return $this->upstream->token($this->payload((string) $request->query('code', ''), $context));
    }

    /**
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $context
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private function claims(array $tokens, array $context): array
    {
        $verified = $this->verifiedIdToken($tokens, $context);
        $claims = $this->upstream->userInfo((string) $tokens['access_token']);
        $this->assertMatchingSubject($verified, $claims);

        return [$claims, $this->authContext->fromUpstreamClaims($verified)];
    }

    /**
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function verifiedIdToken(array $tokens, array $context): array
    {
        $idToken = is_string($tokens['id_token'] ?? null) ? $tokens['id_token'] : null;

        if ($idToken === null) {
            throw new \RuntimeException('The upstream id_token is missing.');
        }

        return $this->verifier->verifyIdToken($idToken, (string) ($context['session_id'] ?? ''));
    }

    /**
     * @param  array<string, mixed>  $verified
     * @param  array<string, mixed>  $claims
     */
    private function assertMatchingSubject(array $verified, array $claims): void
    {
        $verifiedSubject = is_string($verified['sub'] ?? null) ? $verified['sub'] : null;
        $claimSubject = is_string($claims['sub'] ?? null) ? $claims['sub'] : null;

        if ($verifiedSubject === null || $claimSubject === null || ! hash_equals($verifiedSubject, $claimSubject)) {
            throw new \RuntimeException('The upstream subject is inconsistent.');
        }
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, string>
     */
    private function payload(string $code, array $context): array
    {
        return [
            'grant_type' => 'authorization_code',
            'client_id' => (string) config('sso.upstream_oidc.client_id'),
            'client_secret' => (string) config('sso.upstream_oidc.client_secret'),
            'redirect_uri' => (string) config('sso.upstream_oidc.redirect_uri'),
            'code' => $code,
            'code_verifier' => (string) $context['upstream_code_verifier'],
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $authContext
     * @return array<string, mixed>
     */
    private function authorizationCodePayload(
        array $context,
        array $tokens,
        string $subjectId,
        string $sessionId,
        array $authContext,
    ): array {
        return [
            ...$context,
            ...$authContext,
            'session_id' => $sessionId,
            'subject_id' => $subjectId,
            'upstream_refresh_token' => $tokens['refresh_token'] ?? null,
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function redirectUri(string $redirectUri, string $code, array $context): string
    {
        $query = http_build_query([
            'code' => $code,
            'state' => $context['original_state'] ?? null,
            'iss' => config('sso.issuer'),
        ]);

        return $redirectUri.(str_contains($redirectUri, '?') ? '&' : '?').$query;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function frontendErrorRedirect(
        SsoErrorCode $code,
        string $safeReason,
        string $technicalReason,
        Request $request,
        array $context,
        bool $retryAllowed = false,
        bool $alternativeLoginAllowed = false,
    ): string {
        $errorContext = new SsoErrorContext(
            code: $code,
            safeReason: $safeReason,
            technicalReason: $technicalReason,
            clientId: $this->optionalString($context['client_id'] ?? null),
            redirectUri: $this->optionalString($context['redirect_uri'] ?? null),
            sessionId: $this->optionalString($context['session_id'] ?? null),
            correlationId: $request->headers->get('X-Request-Id'),
            retryAllowed: $retryAllowed,
            alternativeLoginAllowed: $alternativeLoginAllowed,
        );

        return $this->errorRedirects->execute($errorContext, $this->ssoErrors->execute($errorContext));
    }

    private function upstreamErrorCode(string $error): SsoErrorCode
    {
        return match ($error) {
            'access_denied' => SsoErrorCode::AccessDenied,
            'invalid_request' => SsoErrorCode::InvalidRequest,
            'temporarily_unavailable' => SsoErrorCode::TemporarilyUnavailable,
            'server_error' => SsoErrorCode::ServerError,
            default => SsoErrorCode::ServerError,
        };
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
