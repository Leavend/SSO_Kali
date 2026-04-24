<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Telescope\TelescopeAccessPolicy;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnforceTelescopeAccess
{
    public function __construct(
        private readonly TelescopeAccessPolicy $policy,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if ($this->policy->allows($request)) {
            return $next($request);
        }

        if ($this->policy->shouldChallenge($request)) {
            return response('Telescope authentication required.', 401, [
                'WWW-Authenticate' => 'Basic realm="dev-sso Telescope"',
            ]);
        }

        abort(404);
    }
}
