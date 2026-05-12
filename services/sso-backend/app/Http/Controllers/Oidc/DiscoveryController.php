<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Services\Oidc\OidcCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * GET /.well-known/openid-configuration — FR-001 / FR-003 / UC-01.
 *
 * Serves OIDC Discovery metadata with:
 *   - ETag + If-None-Match conditional GET (bandwidth saving)
 *   - Cache-Control (CDN-friendly)
 *   - CORS Access-Control-Allow-Origin: * (RFC 8414 — public metadata
 *     must be cross-origin accessible for browser-based RPs)
 */
final class DiscoveryController
{
    public function __invoke(Request $request, OidcCatalog $catalog): JsonResponse|Response
    {
        $discovery = $catalog->discovery();
        $body = json_encode($discovery, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $etag = '"'.hash('sha256', $body).'"';

        $ifNoneMatch = $request->header('If-None-Match');
        if (is_string($ifNoneMatch) && $ifNoneMatch === $etag) {
            return response('', 304)
                ->header('ETag', $etag)
                ->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
                ->header('Access-Control-Allow-Origin', '*');
        }

        return response()
            ->json($discovery)
            ->header('ETag', $etag)
            ->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
            ->header('Vary', 'Accept-Encoding')
            ->header('Access-Control-Allow-Origin', '*');
    }
}
