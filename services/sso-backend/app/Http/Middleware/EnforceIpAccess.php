<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Security\IpAccessRuleEnforcer;
use Closure;
use Illuminate\Http\Request;

final class EnforceIpAccess
{
    public function __construct(private readonly IpAccessRuleEnforcer $enforcer) {}

    /**
     * @param  Closure(Request): mixed  $next
     */
    public function handle(Request $request, Closure $next): mixed
    {
        $ip = $request->ip() ?? $request->getClientIp() ?? '0.0.0.0';

        $this->enforcer->enforce($ip);

        return $next($request);
    }
}
