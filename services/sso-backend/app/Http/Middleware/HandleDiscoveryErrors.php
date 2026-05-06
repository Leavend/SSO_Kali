<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\InvalidOidcConfigurationException;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class HandleDiscoveryErrors
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        try {
            return $next($request);
        } catch (InvalidOidcConfigurationException $e) {
            return new JsonResponse(
                [
                    'error' => 'server_error',
                    'error_description' => 'Service temporarily unavailable due to configuration error. Please contact the administrator.',
                ],
                503,
                [
                    'Cache-Control' => 'no-store',
                    'Pragma' => 'no-cache',
                ]
            );
        } catch (\Throwable $e) {
            return new JsonResponse(
                [
                    'error' => 'server_error',
                    'error_description' => 'Service temporarily unavailable. Please try again later.',
                ],
                500,
                [
                    'Cache-Control' => 'no-store',
                    'Pragma' => 'no-cache',
                ]
            );
        }
    }
}
