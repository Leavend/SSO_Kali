<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Services\Oidc\OidcCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class JwksController
{
    /**
     * GET /.well-known/jwks.json — publish active signing keys (FR-002 / UC-02).
     *
     * Returns 304 Not Modified if client's If-None-Match matches current ETag.
     * ETag computed from sha256 of JWKS body to support conditional caching
     * (UC-31 key rotation — clients can cheaply revalidate).
     */
    public function __invoke(Request $request, OidcCatalog $catalog): JsonResponse|Response
    {
        $jwks = $catalog->jwks();
        $body = json_encode($jwks, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $etag = '"'.hash('sha256', $body).'"';

        $ifNoneMatch = $request->header('If-None-Match');
        if (is_string($ifNoneMatch) && $ifNoneMatch === $etag) {
            return response('', 304)
                ->header('ETag', $etag)
                ->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
                ->header('Access-Control-Allow-Origin', '*');
        }

        return response()
            ->json($jwks)
            ->header('ETag', $etag)
            ->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
            ->header('Vary', 'Accept-Encoding')
            ->header('Access-Control-Allow-Origin', '*');
    }
}
