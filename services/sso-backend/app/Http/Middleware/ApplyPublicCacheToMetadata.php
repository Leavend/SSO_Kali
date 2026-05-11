<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Apply public, cacheable Cache-Control headers to OIDC metadata
 * endpoints (/jwks, /.well-known/openid-configuration).
 *
 * These responses are public, non-sensitive, and change only
 * when keys are rotated—so they benefit from client + CDN caching.
 */
final class ApplyPublicCacheToMetadata
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, ?int $maxAge = null, ?int $staleWhileRevalidate = null): Response
    {
        $response = $next($request);
        $maxAge ??= $this->cacheTtlSeconds();
        $staleWhileRevalidate ??= $this->staleWhileRevalidateSeconds();

        $response->headers->set('Cache-Control', "public, max-age={$maxAge}, stale-while-revalidate={$staleWhileRevalidate}");
        $response->headers->remove('Pragma');

        return $response;
    }

    private function cacheTtlSeconds(): int
    {
        return max(60, (int) config('sso.public_metadata.cache_ttl_seconds', 300));
    }

    private function staleWhileRevalidateSeconds(): int
    {
        return max(0, (int) config('sso.public_metadata.stale_while_revalidate_seconds', 60));
    }
}
