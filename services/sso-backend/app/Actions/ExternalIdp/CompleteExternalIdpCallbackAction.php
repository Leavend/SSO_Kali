<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Models\User;
use App\Services\ExternalIdp\ExternalIdentityProviderRegistry;
use App\Services\ExternalIdp\ExternalIdpAuthenticationRedirectService;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\Request;
use Throwable;

final class CompleteExternalIdpCallbackAction
{
    public function __construct(
        private readonly ExternalIdentityProviderRegistry $registry,
        private readonly ExternalIdpAuthenticationRedirectService $states,
        private readonly ExchangeExternalIdpCallbackTokenAction $exchange,
        private readonly LinkExternalSubjectAccountAction $links,
        private readonly SsoSessionService $sessions,
    ) {}

    /**
     * @return array{ok: bool, user?: User, session_id?: string, return_to?: string, error?: string}
     */
    public function execute(Request $request): array
    {
        $state = $this->queryString($request, 'state');
        $code = $this->queryString($request, 'code');

        if ($state === null || $code === null) {
            return $this->failed('external_idp_invalid_callback');
        }

        $context = $this->states->peek($state);
        if ($context === null) {
            return $this->failed('external_idp_callback_failed');
        }

        $provider = $this->provider($context);
        if (! $provider instanceof ExternalIdentityProvider) {
            $this->states->pull($state);

            return $this->failed('external_idp_unavailable');
        }

        try {
            $requestId = (string) $request->headers->get('X-Request-Id', 'system');
            $exchange = $this->exchange->execute($provider, $state, $code, $requestId);
            $linked = $this->links->execute($provider, $exchange, $requestId);
            $session = $this->sessions->createForUser(
                $linked['user'],
                $request->ip(),
                $request->userAgent(),
            );

            return [
                'ok' => true,
                'user' => $linked['user'],
                'session_id' => $session->session_id,
                'return_to' => $this->safeReturnTo($exchange['return_to'] ?? null),
            ];
        } catch (Throwable) {
            return $this->failed('external_idp_callback_failed');
        }
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function provider(array $context): ?ExternalIdentityProvider
    {
        $providerKey = $context['provider_key'] ?? null;

        if (! is_string($providerKey) || $providerKey === '') {
            return null;
        }

        $provider = ExternalIdentityProvider::query()->where('provider_key', $providerKey)->first();

        if (! $provider instanceof ExternalIdentityProvider || ! $this->registry->isUsable($provider)) {
            return null;
        }

        return $provider;
    }

    /**
     * @return array{ok: false, error: string}
     */
    private function failed(string $error): array
    {
        return ['ok' => false, 'error' => $error];
    }

    private function queryString(Request $request, string $key): ?string
    {
        $value = $request->query($key);

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }

    private function safeReturnTo(mixed $value): string
    {
        if (! is_string($value) || $value === '' || ! str_starts_with($value, '/')) {
            return '/home';
        }

        return str_starts_with($value, '//') ? '/home' : $value;
    }
}
