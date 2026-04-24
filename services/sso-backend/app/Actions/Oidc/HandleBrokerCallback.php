<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AuthContextFactory;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\BrokerCallbackSuccessLogger;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Oidc\UserProfileSynchronizer;
use App\Services\Zitadel\ZitadelBrokerService;
use App\Services\Zitadel\ZitadelTokenVerifier;
use App\Support\Oidc\BrokerAuthFlowCookie;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

final class HandleBrokerCallback
{
    public function __construct(
        private readonly AuthRequestStore $authRequests,
        private readonly AuthorizationCodeStore $codes,
        private readonly AuthContextFactory $authContext,
        private readonly ZitadelBrokerService $broker,
        private readonly ZitadelTokenVerifier $verifier,
        private readonly UserProfileSynchronizer $profiles,
        private readonly LogicalSessionStore $sessions,
        private readonly BrokerAuthFlowCookie $authFlowCookie,
        private readonly BrokerCallbackSuccessLogger $successLogger,
    ) {}

    public function handle(Request $request): JsonResponse|RedirectResponse
    {
        $context = $this->authRequests->pull((string) $request->query('state', ''));

        if ($context === null) {
            return $this->missingContextResponse($request);
        }

        if (is_string($request->query('error'))) {
            return $this->clearAuthFlowCookie(OidcErrorResponse::redirect(
                (string) $context['redirect_uri'],
                (string) $request->query('error'),
                (string) $request->query('error_description', 'Authentication failed upstream.'),
                is_string($context['original_state'] ?? null) ? $context['original_state'] : null,
            ));
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

        return $this->successRedirect($context, $tokens, $claims, $authContext);
    }

    private function missingContextResponse(Request $request): JsonResponse|RedirectResponse
    {
        $context = $this->authFlowCookie->read($request);

        if ($context === null) {
            // No cache entry AND no auth-flow cookie — redirect to landing page
            // instead of showing raw JSON to the end-user.
            $appBaseUrl = (string) config('sso.issuer', config('app.url'));

            return $this->clearAuthFlowCookie(
                redirect()->away($appBaseUrl.'/?error=session_expired')
            );
        }

        return $this->clearAuthFlowCookie(OidcErrorResponse::redirect(
            $context['redirect_uri'],
            'invalid_request',
            'The broker authentication session expired before completion. Start a new sign-in attempt.',
            $context['original_state'],
        ));
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
    private function successRedirect(array $context, array $tokens, array $claims, array $authContext): RedirectResponse
    {
        $user = $this->profiles->sync($claims, [...$context, ...$authContext]);
        $logicalSessionId = $this->sessions->current($user->subject_id);
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
        Log::error('[OIDC_BROKER_CALLBACK_FAILED]', [
            'error' => $exception->getMessage(),
            'trace' => $exception->getTraceAsString(),
            'redirect_uri' => (string) ($context['redirect_uri'] ?? ''),
            'client_id' => (string) ($context['client_id'] ?? ''),
            'original_state' => is_string($context['original_state'] ?? null) ? $context['original_state'] : null,
        ]);

        return OidcErrorResponse::redirect(
            (string) $context['redirect_uri'],
            'temporarily_unavailable',
            'The upstream identity engine is unavailable.',
            is_string($context['original_state'] ?? null) ? $context['original_state'] : null,
        );
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
        return $this->broker->token($this->payload((string) $request->query('code', ''), $context));
    }

    /**
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $context
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private function claims(array $tokens, array $context): array
    {
        $verified = $this->verifiedIdToken($tokens, $context);
        $claims = $this->broker->userInfo((string) $tokens['access_token']);
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
            'client_id' => (string) config('sso.broker.client_id'),
            'client_secret' => (string) config('sso.broker.client_secret'),
            'redirect_uri' => (string) config('sso.broker.redirect_uri'),
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
}
