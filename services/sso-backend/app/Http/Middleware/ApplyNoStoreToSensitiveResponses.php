<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ApplyNoStoreToSensitiveResponses
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $this->shouldApply($request)) {
            return $response;
        }

        $this->applyHeaders($response);

        return $response;
    }

    private function shouldApply(Request $request): bool
    {
        return $request->is(
            'authorize',
            'oauth2/authorize',
            'token',
            'oauth2/token',
            'revocation',
            'oauth2/revocation',
            'connect/register-session',
            'connect/logout',
            'callbacks/*',
            'admin/api/*',
        );
    }

    private function applyHeaders(Response $response): void
    {
        $headers = $response->headers;

        $headers->set('Cache-Control', 'no-store, no-cache, private, max-age=0, must-revalidate');
        $headers->set('Pragma', 'no-cache');
        $headers->set('Expires', '0');
        $headers->set('Surrogate-Control', 'no-store');
        $headers->set('Vary', $this->vary($headers->get('Vary')));
    }

    private function vary(?string $existing): string
    {
        $values = $existing === null ? [] : array_map('trim', explode(',', $existing));
        $values[] = 'Authorization';
        $values[] = 'Cookie';

        return implode(', ', array_values(array_unique(array_filter($values))));
    }
}
