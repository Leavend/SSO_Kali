<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Security\BrokerSessionCookiePolicy;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;

final class AssertBrokerSessionCookiePolicy
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $this->assertSessionCookieHeaders($response);

        return $response;
    }

    private function assertSessionCookieHeaders(Response $response): void
    {
        $expectedName = (string) config('session.cookie');

        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === $expectedName) {
                $this->assertCookie($cookie, $expectedName);
            }
        }
    }

    private function assertCookie(Cookie $cookie, string $expectedName): void
    {
        try {
            BrokerSessionCookiePolicy::assertCookie($cookie, $expectedName);
        } catch (RuntimeException $exception) {
            Log::critical('[BROKER_SESSION_COOKIE_POLICY_VIOLATION]', [
                'cookie' => $cookie->getName(),
                'path' => $cookie->getPath(),
                'secure' => $cookie->isSecure(),
                'domain' => $cookie->getDomain(),
                'error' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }
}
