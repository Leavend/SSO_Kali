<?php

declare(strict_types=1);

namespace App\Support\Security;

use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Http\Request;

final class TokenOriginPolicy
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
    ) {}

    public function allows(Request $request): bool
    {
        $origin = $this->presentedOrigin($request);

        if ($origin === null) {
            return true;
        }

        $client = $this->clients->find((string) $request->input('client_id', ''));

        return $client !== null && in_array($origin, $this->allowedOrigins($client->redirectUris), true);
    }

    private function presentedOrigin(Request $request): ?string
    {
        $origin = $this->normalizeOrigin($request->headers->get('Origin'));

        if ($origin !== null) {
            return $origin;
        }

        return $this->originFromUrl($request->headers->get('Referer'));
    }

    /**
     * @param  list<string>  $redirectUris
     * @return list<string>
     */
    private function allowedOrigins(array $redirectUris): array
    {
        return array_values(array_unique(array_filter(array_map(
            fn (string $uri): ?string => $this->originFromUrl($uri),
            $redirectUris,
        ))));
    }

    private function originFromUrl(?string $value): ?string
    {
        $parts = is_string($value) ? parse_url($value) : false;

        if (! is_array($parts) || ! is_string($parts['scheme'] ?? null) || ! is_string($parts['host'] ?? null)) {
            return null;
        }

        $port = is_int($parts['port'] ?? null) ? ':'.$parts['port'] : '';

        return strtolower($parts['scheme'].'://'.$parts['host'].$port);
    }

    private function normalizeOrigin(?string $value): ?string
    {
        return $this->originFromUrl($value);
    }
}
