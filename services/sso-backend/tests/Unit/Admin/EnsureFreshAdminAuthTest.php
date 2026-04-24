<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(RefreshDatabase::class);

/**
 * EnsureFreshAdminAuth middleware tests.
 *
 * Since AdminFreshnessPolicy is final, we test through HTTP feature tests
 * that exercise the full middleware stack: AdminGuard → EnsureFreshAdminAuth.
 *
 * Without a valid bearer token, the AdminGuard intercepts first → 401.
 * This validates the defense-in-depth chain.
 */
it('returns 401 when no admin context is present on read endpoint', function (): void {
    /** @var TestCase $this */
    $response = $this->getJson('/admin/api/users');

    $response->assertStatus(401);
});

it('returns 401 when no admin context is present on write endpoint', function (): void {
    /** @var TestCase $this */
    $response = $this->deleteJson('/admin/api/sessions/test-session-id');

    $response->assertStatus(401);
});

it('treats the middleware chain as defense-in-depth', function (): void {
    // Validate the route actually has EnsureFreshAdminAuth middleware
    $routes = collect(app('router')->getRoutes()->getRoutes())
        ->filter(fn ($r) => $r->uri() === 'admin/api/me');

    expect($routes)->not->toBeEmpty();

    foreach ($routes as $route) {
        $middleware = $route->middleware();
        $hasFreshAuth = collect($middleware)->contains(
            fn (string $m) => str_contains($m, 'EnsureFreshAdminAuth')
        );

        expect($hasFreshAuth)->toBeTrue(
            'admin/api/me should have EnsureFreshAdminAuth middleware'
        );
    }
});
