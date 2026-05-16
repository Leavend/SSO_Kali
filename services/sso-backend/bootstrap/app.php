<?php

declare(strict_types=1);

use App\Exceptions\SafeOidcExceptionRenderer;
use App\Http\Middleware\ApplyNoStoreToSensitiveResponses;
use App\Http\Middleware\AssertSsoSessionCookiePolicy;
use App\Http\Middleware\EnsureRequestId;
use App\Http\Middleware\LogForwardedHeaderMismatch;
use App\Http\Middleware\TrackCpuPerformance;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function (): void {
            Route::middleware('web')
                ->group(base_path('routes/auth.php'));

            Route::middleware('web')
                ->group(base_path('routes/admin.php'));

            // Stateless OIDC endpoints — bypass session/CSRF/cookie encryption
            // for ~200-500ms faster response on token, JWKS, discovery, etc.
            Route::middleware('oidc-stateless')
                ->group(base_path('routes/oidc.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(
            at: [
                '127.0.0.1',
                '::1',
                '10.0.0.0/8',
                '172.16.0.0/12',
                '192.168.0.0/16',
            ],
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO
                | Request::HEADER_X_FORWARDED_AWS_ELB,
        );

        // Lightweight group for stateless OIDC/system endpoints.
        // No session, no CSRF, no cookie encryption — just security headers + perf tracking.
        $middleware->group('oidc-stateless', [
            EnsureRequestId::class,
            LogForwardedHeaderMismatch::class,
            ApplyNoStoreToSensitiveResponses::class,
            TrackCpuPerformance::class,
        ]);

        $middleware->web(prepend: [
            HandleCors::class,
        ]);

        $middleware->web(append: [
            AssertSsoSessionCookiePolicy::class,
            EnsureRequestId::class,
            LogForwardedHeaderMismatch::class,
            ApplyNoStoreToSensitiveResponses::class,
            TrackCpuPerformance::class,
        ]);

        $middleware->encryptCookies(except: [
            env('SSO_SESSION_COOKIE', '__Host-sso_session'),
        ]);

        $middleware->validateCsrfTokens(except: [
            // OAuth / OIDC endpoints: client auth is via RFC 6749 §2.3 or
            // PKCE, not browser CSRF tokens. Adding these paths under CSRF
            // protection would completely break the token exchange flow.
            'oauth/token',
            'oauth/revoke',
            'userinfo',
            // Back-channel / RP-session endpoints: called server-to-server,
            // never from a browser form.
            'connect/register-session',
            'connect/logout',
            'connect/backchannel/admin-panel/logout',
            // Admin API: uses Bearer token auth, not session cookie.
            'admin/api/*',
            // Portal self-service APIs: protected by XSRF-TOKEN cookie
            // handshake via apiClient, not the default form CSRF field.
            'api/auth/login',
            'api/auth/logout',
            'api/auth/register',
            'api/profile/sessions',
            'api/profile/sessions/*',
            'api/profile/connected-apps/*',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->renderable(static function (Throwable $exception, Request $request) {
            return (new SafeOidcExceptionRenderer)($exception, $request);
        });
    })->create();
