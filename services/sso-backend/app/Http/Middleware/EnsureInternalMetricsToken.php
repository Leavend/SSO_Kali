<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards internal observability endpoints behind a shared header token.
 *
 * - Header name comes from sso.observability.internal_metrics_token_header
 * - Token comes from sso.observability.internal_metrics_token (env)
 * - When no token is configured, the middleware is a no-op so existing
 *   environment/feature gates (e.g. allowed envs, feature flags) keep
 *   acting as the sole guard during local/test runs.
 */
final class EnsureInternalMetricsToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = $this->expectedToken();

        if ($expected === null) {
            return $next($request);
        }

        $headerName = $this->headerName();
        $provided = $request->headers->get($headerName);

        if (! is_string($provided) || ! hash_equals($expected, $provided)) {
            return new JsonResponse(['error' => 'unauthorized'], 401);
        }

        return $next($request);
    }

    private function expectedToken(): ?string
    {
        $token = Config::get('sso.observability.internal_metrics_token');

        if (! is_string($token)) {
            return null;
        }

        $token = trim($token);

        return $token === '' ? null : $token;
    }

    private function headerName(): string
    {
        $header = Config::get('sso.observability.internal_metrics_token_header');

        if (is_string($header) && trim($header) !== '') {
            return trim($header);
        }

        return 'X-SSO-Internal-Metrics-Token';
    }
}
