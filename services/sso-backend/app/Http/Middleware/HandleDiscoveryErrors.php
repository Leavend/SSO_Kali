<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\InvalidOidcConfigurationException;
use App\Support\Responses\OidcErrorResponse;
use Closure;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * BE-FR062-001 — discovery/jwks endpoint exception scrubber.
 *
 * Wraps the discovery and JWKS controllers so any unhandled exception is
 * mapped through the central catalog. Throwables that already carry their
 * own HTTP response (e.g. throttle, signed routes) are re-thrown so the
 * global {@see \App\Exceptions\SafeOidcExceptionRenderer} can pick them up
 * and emit the correct error code with `request_id`/`error_ref`.
 */
final class HandleDiscoveryErrors
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        try {
            return $next($request);
        } catch (HttpResponseException $e) {
            throw $e; // Already carries a status (e.g. 429); let the global renderer map it.
        } catch (HttpExceptionInterface $e) {
            throw $e;
        } catch (InvalidOidcConfigurationException $e) {
            return OidcErrorResponse::json('temporarily_unavailable', null, 503, exception: $e);
        } catch (Throwable $e) {
            return OidcErrorResponse::json('server_error', null, 500, exception: $e);
        }
    }
}
