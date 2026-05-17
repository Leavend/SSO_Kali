<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Enums\SsoErrorCode;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthorizationRequestAuditRecorder;
use App\Services\Oidc\AuthorizationRequestContextFactory;
use App\Services\Oidc\AuthorizationRequestValidator;
use App\Services\Oidc\AuthorizationSsoErrorReporter;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\BrowserAuthorizationSessionResolver;
use App\Services\Oidc\ConsentService;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\OidcProfileMetrics;
use App\Services\Oidc\Upstream\UpstreamOidcClient;
use App\Services\Oidc\UpstreamAuthorizationParameters;
use App\Support\Oidc\AuthorizationClientSession;
use App\Support\Oidc\DownstreamClient;
use App\Support\Oidc\ScopeSet;
use App\Support\Oidc\SsoAuthFlowCookie;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * Authorization orchestration shell.
 * ScopePolicy::validateAuthorizationRequest and invalid_scope handling live in
 * AuthorizationRequestValidator after BE-T03 decomposition.
 */
final class CreateAuthorizationRedirect
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly AuthRequestStore $authRequests,
        private readonly AuthorizationCodeStore $codes,
        private readonly OidcProfileMetrics $metrics,
        private readonly SsoAuthFlowCookie $authFlowCookie,
        private readonly UpstreamOidcClient $upstream,
        private readonly ConsentService $consents,
        private readonly AuthorizationRequestValidator $validator,
        private readonly AuthorizationRequestContextFactory $contextFactory,
        private readonly UpstreamAuthorizationParameters $upstreamParameters,
        private readonly AuthorizationRequestAuditRecorder $audits,
        private readonly AuthorizationSsoErrorReporter $ssoErrors,
        private readonly BrowserAuthorizationSessionResolver $browserSessions,
    ) {}

    public function handle(Request $request): JsonResponse|RedirectResponse
    {
        $client = $this->client($request);
        if ($client === null) {
            $this->audits->rejected($request, null, 'invalid_client');

            return OidcErrorResponse::json('invalid_client', 'Unknown client or redirect URI.', 400);
        }

        return $this->validatedRedirect($request, $client);
    }

    private function validatedRedirect(Request $request, DownstreamClient $client): JsonResponse|RedirectResponse
    {
        $error = $this->validator->validate($request, $client);
        if ($error !== null) {
            $this->audits->rejected($request, $client, $error['reason']);

            return $this->errorResponse($error);
        }

        return $this->redirectForValidRequest($request, $client, $this->contextFactory->make($request, $client));
    }

    /** @param array<string, mixed> $context */
    private function redirectForValidRequest(Request $request, DownstreamClient $client, array $context): RedirectResponse
    {
        $session = $this->browserSessions->reusable($request, $client, $context);
        if ($session instanceof AuthorizationClientSession) {
            return $this->browserSessionRedirect($request, $session);
        }
        if ($this->prompt($request) === 'none') {
            return $this->loginRequiredRedirect($request, $client, $context);
        }

        return $this->upstreamRedirect($request, $client, $context);
    }

    /** @param array<string, mixed> $context prompt=none */
    private function loginRequiredRedirect(Request $request, DownstreamClient $client, array $context): RedirectResponse
    {
        $this->audits->rejected($request, $client, 'login_required', $context);
        $this->ssoErrors->record(SsoErrorCode::LoginRequired, 'prompt_none_requires_login', 'The request requires user interaction, but prompt=none was requested.', $request, $context);

        return OidcErrorResponse::redirect((string) $context['redirect_uri'], 'login_required', 'Login is required to continue.', $this->optionalString($context['original_state'] ?? null));
    }

    /** @param array<string, mixed> $context */
    private function upstreamRedirect(Request $request, DownstreamClient $client, array $context): RedirectResponse
    {
        $upstreamState = $this->authRequests->put($context);
        if ($upstreamState === null) {
            $this->audits->rejected($request, $client, 'temporarily_unavailable', $context);

            return redirect()->away($this->ssoErrors->redirect(SsoErrorCode::TemporarilyUnavailable, 'auth_request_store_unavailable', 'The authentication session could not be started.', $request, $context, true, true));
        }

        $this->audits->accepted($request, $client, $context, 'upstream_redirect');

        return redirect()->away($this->upstream->authorizationUrl($this->upstreamParameters->make($upstreamState, $context)))
            ->withCookie($this->authFlowCookie->issue($context));
    }

    private function browserSessionRedirect(Request $request, AuthorizationClientSession $session): RedirectResponse
    {
        if (! $this->requiresConsent($session, $request)) {
            $this->audits->accepted($request, $session->client, $session->context, 'local_session', $session->browserContext);

            return $this->localRedirect($session->context, $session->browserContext);
        }
        if ($this->prompt($request) === 'none') {
            $this->audits->rejected($request, $session->client, 'consent_required', $session->context);

            return OidcErrorResponse::redirect((string) $session->context['redirect_uri'], 'consent_required', 'Consent is required to continue.', $this->optionalString($session->context['original_state'] ?? null));
        }

        return $this->consentRedirect($session);
    }

    private function consentRedirect(AuthorizationClientSession $session): RedirectResponse
    {
        $state = $this->authRequests->put([...$session->context, ...$session->browserContext, 'scope' => $session->context['scope']]);

        return redirect()->away($this->consentRedirectUri($session->client, $session->context, $state));
    }

    /** @param array<string, mixed> $context @param array<string, mixed> $browserContext */
    private function localRedirect(array $context, array $browserContext): RedirectResponse
    {
        $payload = [...$context, ...$browserContext];
        $code = $this->codes->issue($payload);

        return redirect()->away($this->callbackUri((string) $payload['redirect_uri'], $code, $payload));
    }

    private function client(Request $request): ?DownstreamClient
    {
        return $this->clients->resolve((string) $request->query('client_id', ''), (string) $request->query('redirect_uri', ''));
    }

    /** @param array<string, mixed> $context */
    private function callbackUri(string $redirectUri, string $code, array $context): string
    {
        $query = http_build_query(['code' => $code, 'state' => $context['original_state'] ?? null, 'iss' => config('sso.issuer')]);

        return $redirectUri.(str_contains($redirectUri, '?') ? '&' : '?').$query;
    }

    /** @param array{reason: string, description: string} $error */
    private function errorResponse(array $error): JsonResponse
    {
        $this->metrics->incrementReject($error['reason']);
        $code = $error['reason'] === 'invalid_scope' ? 'invalid_scope' : 'invalid_request';

        return OidcErrorResponse::json($code, $error['description'], 400);
    }

    private function requiresConsent(AuthorizationClientSession $session, Request $request): bool
    {
        if ($session->client->skipConsent) {
            return false;
        }
        if ($this->prompt($request) === 'consent') {
            return true;
        }

        return ! $this->consents->hasConsent((string) ($session->browserContext['subject_id'] ?? ''), $session->client->clientId, ScopeSet::fromString((string) ($session->context['scope'] ?? 'openid')));
    }

    /** @param array<string, mixed> $context */
    private function consentRedirectUri(DownstreamClient $client, array $context, ?string $state): string
    {
        return rtrim((string) config('sso.frontend_url', ''), '/').'/auth/consent?'.http_build_query(['client_id' => $client->clientId, 'scope' => $context['scope'] ?? 'openid', 'state' => $state]);
    }

    private function prompt(Request $request): ?string
    {
        $prompt = $request->query('prompt');
        if (! is_string($prompt) || $prompt === '') {
            return null;
        }

        return in_array($prompt, ['login', 'consent', 'select_account', 'none'], true) ? $prompt : null;
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
