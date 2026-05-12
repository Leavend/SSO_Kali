<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Support\Oidc\OidcScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * GET /api/oidc/scopes — public scope registry (FR-004 Issue #5 / UC-07).
 *
 * Exposes the server's scope catalog so RPs and portal UIs can discover
 * what scopes exist, what claims they unlock, and whether they're
 * default-allowed. This is the single source of truth; the frontend
 * `scope-labels.ts` should hydrate from this endpoint and fall back to
 * its static map when the network is unavailable.
 *
 * Follows the same caching strategy as other metadata endpoints (ETag +
 * 304 Not Modified + public Cache-Control). CORS-friendly for browser
 * consumption from any RP.
 */
final class ScopeCatalogController
{
    public function __invoke(Request $request): JsonResponse|Response
    {
        $catalog = OidcScope::catalog();
        $payload = [
            'scopes' => array_map(
                static fn (string $name, array $meta): array => [
                    'name' => $name,
                    'description' => $meta['description'],
                    'claims' => $meta['claims'],
                    'default_allowed' => $meta['default_allowed'],
                ],
                array_keys($catalog),
                array_values($catalog),
            ),
        ];

        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $etag = '"'.hash('sha256', $body).'"';

        $ifNoneMatch = $request->header('If-None-Match');
        if (is_string($ifNoneMatch) && $ifNoneMatch === $etag) {
            return response('', 304)
                ->header('ETag', $etag)
                ->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
                ->header('Access-Control-Allow-Origin', '*');
        }

        return response()
            ->json($payload)
            ->header('ETag', $etag)
            ->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
            ->header('Vary', 'Accept-Encoding')
            ->header('Access-Control-Allow-Origin', '*');
    }
}
