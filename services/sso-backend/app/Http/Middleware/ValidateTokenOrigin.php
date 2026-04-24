<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Responses\OidcErrorResponse;
use App\Support\Security\TokenOriginPolicy;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ValidateTokenOrigin
{
    public function __construct(
        private readonly TokenOriginPolicy $policy,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if ($this->policy->allows($request)) {
            return $next($request);
        }

        return $this->rejected();
    }

    private function rejected(): JsonResponse
    {
        return OidcErrorResponse::json(
            'invalid_request',
            'Origin is not allowed for this client.',
            403,
        );
    }
}
