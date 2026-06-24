<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\OidcClientRegistration;
use App\Support\Oidc\ClientUrlOrigin;
use Illuminate\Support\Facades\Cache;

final class WidgetOriginPolicy
{
    private const string CACHE_KEY = 'widget_cors_allowed_origins:v1';

    public function allows(?string $origin): bool
    {
        if (! is_string($origin) || $origin === '') {
            return false;
        }

        $normalized = $this->origin($origin);

        return $normalized !== null && in_array($normalized, $this->allowedOrigins(), true);
    }

    public function origin(?string $url): ?string
    {
        if (! is_string($url) || $url === '') {
            return null;
        }

        $parts = ClientUrlOrigin::parse($url);
        if ($parts === null || ! in_array(strtolower((string) $parts['scheme']), ['http', 'https'], true)) {
            return null;
        }

        return ClientUrlOrigin::fromParts($parts);
    }

    /**
     * @return list<string>
     */
    public function allowedOrigins(): array
    {
        return Cache::remember(
            self::CACHE_KEY,
            300,
            fn (): array => $this->buildAllowedOrigins(),
        );
    }

    public function flush(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * @return list<string>
     */
    private function buildAllowedOrigins(): array
    {
        $origins = [];
        $this->addFirstPartyOrigins($origins);

        OidcClientRegistration::query()
            ->where('status', 'active')
            ->get()
            ->each(function (OidcClientRegistration $registration) use (&$origins): void {
                $this->addOrigin($origins, $registration->app_base_url);
            });

        foreach (config('oidc_clients.clients', []) as $config) {
            if (! is_array($config)) {
                continue;
            }

            $this->addOrigin($origins, $config['app_base_url'] ?? null);
        }

        sort($origins);

        return array_values(array_unique($origins));
    }

    /**
     * @param  list<string>  $origins
     */
    private function addFirstPartyOrigins(array &$origins): void
    {
        $this->addOrigin($origins, config('sso.base_url'));
        $this->addOrigin($origins, config('sso.frontend_url'));
        $this->addOrigin($origins, config('sso.admin_frontend_url'));

        $configuredOrigins = config('sso.widget.first_party_origins', []);
        if (! is_array($configuredOrigins)) {
            return;
        }

        foreach ($configuredOrigins as $origin) {
            $this->addOrigin($origins, $origin);
        }
    }

    /**
     * @param  list<string>  $origins
     */
    private function addOrigin(array &$origins, mixed $url): void
    {
        $origin = is_string($url) ? $this->origin($url) : null;
        if ($origin !== null) {
            $origins[] = $origin;
        }
    }
}
