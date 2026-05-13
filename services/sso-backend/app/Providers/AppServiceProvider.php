<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\Passport\Client;
use App\Models\User;
use App\Services\Directory\DatabaseDirectoryUserProvider;
use App\Services\Directory\DirectoryUserProvider;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\AuthThrottleResponder;
use App\Support\Security\SsoSessionCookiePolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Passport\Passport;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(DownstreamClientRegistry::class);
        $this->app->bind(DirectoryUserProvider::class, DatabaseDirectoryUserProvider::class);
    }

    public function boot(): void
    {
        $this->configurePassport();
        $this->assertSsoSessionCookiePolicy();
        $this->registerRateLimiters();
    }

    private function configurePassport(): void
    {
        // FR-005/FR-006: client IDs in this SSO are the string slugs declared
        // in config/oidc_clients.php (sso-frontend-portal, app-a, app-b, ...).
        // Disable Passport's default UUID identifier so oauth_clients.id is
        // a plain string that matches the config registry.
        Passport::$clientUuids = false;

        Passport::useClientModel(Client::class);
        Passport::authorizationView('passport.authorize');
        Passport::tokensCan([
            'openid' => 'OpenID Connect sign-in',
            'profile' => 'Basic profile claims',
            'email' => 'Email claims',
        ]);
        Passport::tokensExpireIn(now()->addMinutes((int) config('sso.ttl.access_token_minutes', 15)));
        Passport::refreshTokensExpireIn(now()->addDays((int) config('sso.ttl.refresh_token_days', 30)));
    }

    private function assertSsoSessionCookiePolicy(): void
    {
        if ($this->app->environment('testing')) {
            return;
        }

        SsoSessionCookiePolicy::assertConfigured(
            (string) config('sso.session.cookie'),
            (bool) config('session.secure'),
            (string) config('session.path'),
            config('session.domain'),
        );
    }

    private function registerRateLimiters(): void
    {
        $this->registerOidcAuthorizeLimiter();
        $this->registerOidcCallbackLimiter();
        $this->registerOidcTokenLimiter();
        $this->registerOidcResourceLimiter();
        $this->registerProfileApiLimiter();
        $this->registerOidcDiscoveryLimiter();
        $this->registerOidcJwksLimiter();
        $this->registerAdminBootstrapLimiter();
        $this->registerAdminReadLimiter();
        $this->registerAdminWriteLimiter();
    }

    private function principalLimit(Request $request, string $namespace, int $perMinute): Limit
    {
        $admin = $request->attributes->get('admin_user');
        $key = $admin instanceof User ? $admin->email : $request->ip();

        return Limit::perMinute($perMinute)->by($namespace.':'.$key);
    }

    private function ipLimit(Request $request, string $namespace, int $perMinute): Limit
    {
        return Limit::perMinute($perMinute)->by($namespace.':'.$request->ip());
    }

    private function registerOidcAuthorizeLimiter(): void
    {
        RateLimiter::for('oidc-authorize', fn (Request $request): Limit => $this->ipLimit(
            $request,
            'oidc-authorize',
            (int) config('sso.rate_limits.authorize_per_minute', 20),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->authorize($request, $headers)));
    }

    private function registerOidcCallbackLimiter(): void
    {
        RateLimiter::for('oidc-callback', fn (Request $request): Limit => $this->ipLimit(
            $request,
            'oidc-callback',
            (int) config('sso.rate_limits.callback_per_minute', 30),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->callback($request, $headers)));
    }

    private function registerOidcTokenLimiter(): void
    {
        RateLimiter::for('oidc-token', fn (Request $request): Limit => $this->ipLimit(
            $request,
            'oidc-token',
            (int) config('sso.rate_limits.token_per_minute', 30),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->callback($request, $headers)));
    }

    private function registerAdminBootstrapLimiter(): void
    {
        RateLimiter::for('admin-bootstrap', fn (Request $request): Limit => $this->principalLimit(
            $request,
            'admin-bootstrap',
            (int) config('sso.rate_limits.admin_bootstrap_per_minute', 20),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->adminApi($headers)));
    }

    private function registerAdminReadLimiter(): void
    {
        RateLimiter::for('admin-read', fn (Request $request): Limit => $this->principalLimit(
            $request,
            'admin-read',
            (int) config('sso.admin.rate_limits.read_per_minute', 60),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->adminApi($headers)));
    }

    private function registerAdminWriteLimiter(): void
    {
        RateLimiter::for('admin-write', fn (Request $request): Limit => $this->principalLimit(
            $request,
            'admin-write',
            (int) config('sso.admin.rate_limits.write_per_minute', 10),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->adminApi($headers)));
    }

    private function registerOidcResourceLimiter(): void
    {
        RateLimiter::for('oidc-resource', fn (Request $request): Limit => $this->ipLimit(
            $request,
            'oidc-resource',
            (int) config('sso.rate_limits.resource_per_minute', 60),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->callback($request, $headers)));
    }

    private function registerProfileApiLimiter(): void
    {
        RateLimiter::for('profile-api', fn (Request $request): Limit => $this->ipLimit(
            $request,
            'profile-api',
            (int) config('sso.rate_limits.profile_api_per_minute', 240),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->callback($request, $headers)));
    }

    private function registerOidcDiscoveryLimiter(): void
    {
        RateLimiter::for('oidc-discovery', fn (Request $request): Limit => $this->ipLimit(
            $request,
            'oidc-discovery',
            (int) config('sso.rate_limits.discovery_per_minute', 60),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->adminApi($headers)));
    }

    private function registerOidcJwksLimiter(): void
    {
        RateLimiter::for('oidc-jwks', fn (Request $request): Limit => $this->ipLimit(
            $request,
            'oidc-jwks',
            (int) config('sso.rate_limits.jwks_per_minute', 60),
        )->response(fn (Request $request, array $headers) => app(AuthThrottleResponder::class)->adminApi($headers)));
    }
}
