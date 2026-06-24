<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Oidc\ClientUrlOrigin;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureTrustedBrowserMutation
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return $next($request);
        }

        $presentedOrigin = $this->presentedOrigin($request);
        if ($presentedOrigin === null) {
            return $this->forbidden();
        }

        if (
            $request->header('X-Requested-With') !== 'XMLHttpRequest'
            || ! in_array($presentedOrigin, $this->trustedOrigins(), true)
        ) {
            return $this->forbidden();
        }

        return $next($request);
    }

    private function presentedOrigin(Request $request): ?string
    {
        $origin = $this->normalizeOrigin($request->headers->get('Origin'));
        if ($origin !== null) {
            return $origin;
        }

        return $this->normalizeOrigin($request->headers->get('Referer'));
    }

    /**
     * @return list<string>
     */
    private function trustedOrigins(): array
    {
        return array_values(array_unique(array_filter([
            $this->normalizeOrigin(config('sso.frontend_url')),
            $this->normalizeOrigin(config('sso.base_url')),
            $this->normalizeOrigin(config('app.url')),
            ...array_map(
                fn (mixed $origin): ?string => $this->normalizeOrigin($origin),
                is_array(config('sso.browser_mutation.trusted_origins'))
                    ? config('sso.browser_mutation.trusted_origins')
                    : [],
            ),
        ], static fn (?string $origin): bool => $origin !== null)));
    }

    private function normalizeOrigin(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        $parts = ClientUrlOrigin::parse($value);
        if ($parts === null) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        if (! in_array($scheme, ['http', 'https'], true)) {
            return null;
        }

        return ClientUrlOrigin::fromParts($parts);
    }

    private function forbidden(): JsonResponse
    {
        return response()->json([
            'error' => 'forbidden',
            'message' => 'Browser mutation origin is not trusted.',
        ], 403);
    }
}
