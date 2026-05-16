<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Actions\Auth\LogoutSsoSessionAction;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\SigningKeyService;
use App\Services\Session\SsoSessionCookieFactory;
use App\Services\Session\SsoSessionCookieResolver;
use App\Support\Oidc\DownstreamClient;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class PerformFrontChannelLogout
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly LogoutSsoSessionAction $logout,
        private readonly RecordLogoutAuditEventAction $audit,
        private readonly SigningKeyService $keys,
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionCookieFactory $cookieFactory,
    ) {}

    public function handle(Request $request): Response
    {
        $client = $this->client($request);

        if (! $client instanceof DownstreamClient) {
            $this->auditFailure($request, 'invalid_client');

            return OidcErrorResponse::json('invalid_client', 'The logout client is invalid.', 400);
        }

        if (! $this->allowsRedirect($client, $request)) {
            $this->auditFailure($request, 'invalid_post_logout_redirect_uri', $client->clientId);

            return OidcErrorResponse::json('invalid_request', 'The post logout redirect URI is invalid.', 400);
        }

        if (! $this->idTokenHintMatchesSession($request)) {
            $this->auditFailure($request, 'id_token_hint_session_mismatch', $client->clientId);

            return OidcErrorResponse::json('invalid_request', 'The id_token_hint does not match the active session.', 400);
        }

        $this->auditStarted($request, $client->clientId);
        $result = $this->logout->execute($this->cookies->resolve($request));
        $this->auditCompleted($request, $client->clientId, $result->sessionId, $result->subjectId);

        return $this->response($request);
    }

    private function client(Request $request): ?DownstreamClient
    {
        $clientId = $this->clientId($request);

        return $clientId === null ? null : $this->clients->find($clientId);
    }

    private function clientId(Request $request): ?string
    {
        $explicit = $request->query('client_id');

        if (is_string($explicit) && $explicit !== '') {
            return $explicit;
        }

        return $this->clientIdFromHint($request);
    }

    private function clientIdFromHint(Request $request): ?string
    {
        $hint = $request->query('id_token_hint');

        if (! is_string($hint) || $hint === '') {
            return null;
        }

        try {
            $audience = $this->keys->decode($hint)['aud'] ?? null;
        } catch (\Throwable) {
            return null;
        }

        return is_string($audience) ? $audience : null;
    }

    /**
     * BE-FR041-001: when an id_token_hint is supplied alongside an active
     * SSO session cookie, its sid (and sub when present) MUST match the
     * current browser session before any logout side-effect runs. Without
     * this binding a stale-but-valid id_token_hint can drive a logout
     * audit/redirect for a session it has no right to terminate.
     */
    private function idTokenHintMatchesSession(Request $request): bool
    {
        $hint = $request->query('id_token_hint');

        if (! is_string($hint) || $hint === '') {
            return true;
        }

        $sessionId = $this->cookies->resolve($request);

        if ($sessionId === null || $sessionId === '') {
            return true;
        }

        try {
            $claims = $this->keys->decode($hint);
        } catch (\Throwable) {
            return true;
        }

        $hintSid = is_string($claims['sid'] ?? null) ? $claims['sid'] : null;

        return $hintSid === null || $hintSid === '' || hash_equals($sessionId, $hintSid);
    }

    private function allowsRedirect(DownstreamClient $client, Request $request): bool
    {
        $uri = $request->query('post_logout_redirect_uri');

        return ! is_string($uri) || $uri === '' || $client->allowsPostLogoutRedirectUri($uri);
    }

    private function response(Request $request): JsonResponse|RedirectResponse
    {
        $redirectUri = $request->query('post_logout_redirect_uri');

        if (! is_string($redirectUri) || $redirectUri === '') {
            return response()->json(['signed_out' => true])
                ->withCookie($this->cookieFactory->forget());
        }

        return redirect()->away($this->redirectUri($redirectUri, $request))
            ->withCookie($this->cookieFactory->forget());
    }

    private function redirectUri(string $redirectUri, Request $request): string
    {
        $state = $request->query('state');

        if (! is_string($state) || $state === '') {
            return $redirectUri;
        }

        return $redirectUri.(str_contains($redirectUri, '?') ? '&' : '?').http_build_query(['state' => $state]);
    }

    private function auditStarted(Request $request, string $clientId): void
    {
        $this->audit->execute('frontchannel_logout_started', $this->auditContext($request, $clientId, 'started'));
    }

    private function auditCompleted(Request $request, string $clientId, ?string $sessionId, ?string $subjectId): void
    {
        $this->audit->execute('frontchannel_logout_completed', array_merge(
            $this->auditContext($request, $clientId, 'succeeded'),
            ['session_id' => $sessionId, 'subject_id' => $subjectId],
        ));
    }

    private function auditFailure(Request $request, string $reason, ?string $clientId = null): void
    {
        $this->audit->execute('frontchannel_logout_failed', array_merge(
            $this->auditContext($request, $clientId, 'failed'),
            ['failure_class' => $reason],
        ));
    }

    /**
     * @return array<string, mixed>
     */
    private function auditContext(Request $request, ?string $clientId, string $result): array
    {
        return [
            'client_id' => $clientId,
            'logout_channel' => 'frontchannel',
            'post_logout_redirect_uri' => $request->query('post_logout_redirect_uri'),
            'result' => $result,
            'state' => $request->query('state'),
        ];
    }
}
