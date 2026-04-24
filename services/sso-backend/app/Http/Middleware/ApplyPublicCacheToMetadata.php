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
    private const DEFAULT_MAX_AGE = 300; // 5 minutes

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, int $maxAge = self::DEFAULT_MAX_AGE): Response
    {
        $response = $next($request);

        $response->headers->set('Cache-Control', "public, max-age={$maxAge}, must-revalidate");
        $response->headers->remove('Pragma');

        return $response;
    }
}
