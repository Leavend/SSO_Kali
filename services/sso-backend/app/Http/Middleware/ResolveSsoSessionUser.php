<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * FR-018: Resolve authenticated user from SSO session cookie.
 *
 * Sets the authenticated user on the request so controllers
 * can use $request->user() or $request->attributes->get('sso_user').
 */
final class ResolveSsoSessionUser
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessions,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $sessionId = $this->cookies->resolve($request);
        $session = $this->sessions->current($sessionId);

        if ($session === null) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $user = User::query()->find($session->user_id);

        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $request->setUserResolver(fn () => $user);
        $request->attributes->set('sso_user', $user);
        $request->attributes->set('sso_session', $session);

        return $next($request);
    }
}
