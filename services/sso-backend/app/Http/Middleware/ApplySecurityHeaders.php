<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ApplySecurityHeaders
{
    private const HSTS = 'max-age=31536000; includeSubDomains; preload';

    private const CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $headers = $response->headers;

        $headers->set('Strict-Transport-Security', self::HSTS);
        $headers->set('X-Frame-Options', 'DENY');
        $headers->set('X-Content-Type-Options', 'nosniff');
        $headers->set('Referrer-Policy', $headers->get('Referrer-Policy') ?? 'no-referrer');
        $headers->set('Permissions-Policy', $headers->get('Permissions-Policy') ?? 'camera=(), microphone=(), geolocation=(), payment=()');

        if (! $headers->has('Content-Security-Policy')) {
            $headers->set('Content-Security-Policy', self::CSP);
        }

        return $response;
    }
}
