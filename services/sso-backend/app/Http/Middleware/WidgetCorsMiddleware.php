<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Oidc\WidgetOriginPolicy;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class WidgetCorsMiddleware
{
    public function __construct(private readonly WidgetOriginPolicy $origins) {}

    public function handle(Request $request, Closure $next): Response
    {
        $origin = $request->header('Origin');

        if (! $origin) {
            return $next($request);
        }

        if ($request->isMethod('OPTIONS')) {
            $response = response('', 204);
        } else {
            $response = $next($request);
        }

        if ($this->origins->allows($origin)) {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Access-Control-Allow-Credentials', 'true');
            $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-SSO-Widget-Action, X-XSRF-TOKEN');
            $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        }

        $response->headers->set('Vary', 'Origin', false);

        return $response;
    }
}
