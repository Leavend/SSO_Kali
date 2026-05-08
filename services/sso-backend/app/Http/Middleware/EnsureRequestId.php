<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class EnsureRequestId
{
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = $this->resolveRequestId($request);
        $request->headers->set('X-Request-Id', $requestId);

        $response = $next($request);
        $response->headers->set('X-Request-Id', $requestId);

        return $response;
    }

    private function resolveRequestId(Request $request): string
    {
        $requestId = $request->headers->get('X-Request-Id');

        if (is_string($requestId) && $requestId !== '') {
            return Str::limit($requestId, 128, '');
        }

        return (string) Str::uuid();
    }
}
