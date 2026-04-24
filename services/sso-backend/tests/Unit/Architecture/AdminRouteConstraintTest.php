<?php

declare(strict_types=1);

/**
 * Architecture-level admin route audit.
 *
 * Ensures every admin API route is protected by:
 * 1. AdminGuard middleware (RBAC)
 * 2. Rate limiting (throttle:admin-*)
 * 3. Validates destructive routes require session management role
 */
it('applies AdminGuard to all admin API routes', function (): void {
    $adminRoutes = collect(app('router')->getRoutes()->getRoutes())
        ->filter(fn ($route) => str_starts_with($route->uri(), 'admin/api/'));

    expect($adminRoutes)->not->toBeEmpty();

    foreach ($adminRoutes as $route) {
        $middleware = $route->middleware();
        $hasGuard = collect($middleware)->contains(
            fn (string $m) => str_contains($m, 'AdminGuard')
        );

        expect($hasGuard)->toBeTrue(
            "Route [{$route->uri()}] missing AdminGuard (RBAC bypass risk)."
        );
    }
});

it('applies rate limiting to all admin API routes', function (): void {
    $adminRoutes = collect(app('router')->getRoutes()->getRoutes())
        ->filter(fn ($route) => str_starts_with($route->uri(), 'admin/api/'));

    foreach ($adminRoutes as $route) {
        $middleware = $route->middleware();
        $hasThrottle = collect($middleware)->contains(
            fn (string $m) => str_starts_with($m, 'throttle:admin-')
        );

        expect($hasThrottle)->toBeTrue(
            "Route [{$route->uri()}] missing rate limiting (DoS risk)."
        );
    }
});

it('enforces session management role on all DELETE routes', function (): void {
    $deleteRoutes = collect(app('router')->getRoutes()->getRoutesByMethod()['DELETE'] ?? [])
        ->filter(fn ($route) => str_starts_with($route->uri(), 'admin/api/'));

    expect($deleteRoutes)->not->toBeEmpty();

    foreach ($deleteRoutes as $route) {
        $middleware = $route->middleware();
        $hasRole = collect($middleware)->contains(
            fn (string $m) => str_contains($m, 'RequireAdminSessionManagementRole')
        );

        expect($hasRole)->toBeTrue(
            "DELETE [{$route->uri()}] missing RequireAdminSessionManagementRole."
        );
    }
});

it('enforces freshness check on all admin endpoints', function (): void {
    $adminRoutes = collect(app('router')->getRoutes()->getRoutes())
        ->filter(fn ($route) => str_starts_with($route->uri(), 'admin/api/'));

    foreach ($adminRoutes as $route) {
        $middleware = $route->middleware();
        $hasFresh = collect($middleware)->contains(
            fn (string $m) => str_contains($m, 'EnsureFreshAdminAuth')
        );

        expect($hasFresh)->toBeTrue(
            "Route [{$route->uri()}] missing EnsureFreshAdminAuth."
        );
    }
});

it('enforces MFA assurance middleware on all admin endpoints', function (): void {
    $adminRoutes = collect(app('router')->getRoutes()->getRoutes())
        ->filter(fn ($route) => str_starts_with($route->uri(), 'admin/api/'));

    foreach ($adminRoutes as $route) {
        $middleware = $route->middleware();
        $hasMfa = collect($middleware)->contains(
            fn (string $m) => str_contains($m, 'EnsureAdminMfaAssurance')
        );

        expect($hasMfa)->toBeTrue(
            "Route [{$route->uri()}] missing EnsureAdminMfaAssurance."
        );
    }
});
