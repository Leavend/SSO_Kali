<?php

declare(strict_types=1);

namespace App\Support\Oidc;

use App\Models\OidcClientRegistration;

final class TrustedRedirectUriPolicy
{
    /**
     * @param  list<mixed>  $additionalOrigins  Candidate trusted origins supplied
     *                                          in the same admin request (not yet
     *                                          persisted), so a redirect URI and
     *                                          the origins that authorize it can be
     *                                          saved together.
     */
    public function allows(string $clientId, string $uri, array $additionalOrigins = []): bool
    {
        return $this->permits($uri, $this->trustedOriginsFor($clientId, $additionalOrigins));
    }

    /**
     * Resolve a client's full trusted-origin set in a single registration query,
     * so an admin update validating N redirect + M post-logout URIs computes it
     * once instead of re-querying per URI.
     *
     * @param  list<mixed>  $additionalOrigins  Candidate trusted origins supplied
     *                                          in the same admin request (not yet
     *                                          persisted), so a redirect URI and
     *                                          the origins that authorize it can be
     *                                          saved together.
     * @return list<string>
     */
    public function trustedOriginsFor(string $clientId, array $additionalOrigins = []): array
    {
        return array_values(array_unique([
            ...$this->trustedOrigins($clientId),
            ...$this->normalizeOrigins($additionalOrigins),
        ]));
    }

    /**
     * @param  list<string>  $trustedOrigins
     */
    public function permits(string $uri, array $trustedOrigins): bool
    {
        if (! RedirectUriWellFormedness::isWellFormed($uri)) {
            return false;
        }

        $origin = ClientUrlOrigin::parse($uri);
        if ($origin === null) {
            return false;
        }

        return in_array(ClientUrlOrigin::fromParts($origin), $trustedOrigins, true);
    }

    /**
     * @return list<string>
     */
    private function trustedOrigins(string $clientId): array
    {
        $registration = OidcClientRegistration::query()->where('client_id', $clientId)->first();
        if (! $registration instanceof OidcClientRegistration) {
            return [];
        }

        $origins = [
            $this->origin($registration->app_base_url),
            ...$this->contractOrigins($registration->contract),
            ...$this->persistedRedirectOrigins($registration),
        ];

        return array_values(array_unique(array_filter($origins, 'is_string')));
    }

    /**
     * Origins of the client's already-persisted redirect and post-logout URIs.
     * They were saved through this same gate (or predate it), so re-saving or
     * editing an existing off-origin client must not 422 on its own stored URIs;
     * only a brand-new origin still requires an explicit trusted_redirect_origins
     * submission.
     *
     * @return list<string|null>
     */
    private function persistedRedirectOrigins(OidcClientRegistration $registration): array
    {
        $uris = [
            ...(is_array($registration->redirect_uris) ? $registration->redirect_uris : []),
            ...(is_array($registration->post_logout_redirect_uris) ? $registration->post_logout_redirect_uris : []),
        ];

        return array_map(fn (mixed $value): ?string => $this->origin($value), $uris);
    }

    /**
     * @param  array<string, mixed>|null  $contract
     * @return list<string|null>
     */
    private function contractOrigins(?array $contract): array
    {
        $values = is_array($contract['trusted_redirect_origins'] ?? null)
            ? $contract['trusted_redirect_origins']
            : [];

        return array_map(fn (mixed $value): ?string => $this->origin($value), $values);
    }

    /**
     * @param  list<mixed>  $origins
     * @return list<string>
     */
    private function normalizeOrigins(array $origins): array
    {
        return array_values(array_filter(
            array_map(fn (mixed $value): ?string => $this->origin($value), $origins),
            'is_string',
        ));
    }

    private function origin(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $origin = ClientUrlOrigin::parse($value);
        if ($origin === null) {
            return null;
        }

        $scheme = strtolower((string) ($origin['scheme'] ?? ''));

        return $scheme === 'https' ? ClientUrlOrigin::fromParts($origin) : null;
    }
}
