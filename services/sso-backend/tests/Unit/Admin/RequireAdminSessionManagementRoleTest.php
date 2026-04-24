<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(RefreshDatabase::class);

/**
 * RequireAdminSessionManagementRole middleware tests.
 *
 * Since AdminPermissionMatrix and AdminAuditLogger are final,
 * we test via HTTP feature tests that exercise the full guard chain.
 */
it('returns 401 on DELETE without bearer token', function (): void {
    /** @var TestCase $this */
    $response = $this->deleteJson('/admin/api/sessions/abc-123');

    $response->assertStatus(401);
});

it('returns 401 on batch-revoke without bearer token', function (): void {
    /** @var TestCase $this */
    $response = $this->deleteJson('/admin/api/users/user-123/sessions');

    $response->assertStatus(401);
});

it('validates destructive routes have session management middleware', function (): void {
    $destructiveRoutes = collect(app('router')->getRoutes()->getRoutesByMethod()['DELETE'] ?? [])
        ->filter(fn ($r) => str_starts_with($r->uri(), 'admin/api/'));

    expect($destructiveRoutes)->not->toBeEmpty();

    foreach ($destructiveRoutes as $route) {
        $middleware = $route->middleware();
        $hasSessionMgmt = collect($middleware)->contains(
            fn (string $m) => str_contains($m, 'RequireAdminSessionManagementRole')
        );

        expect($hasSessionMgmt)->toBeTrue(
            "DELETE [{$route->uri()}] must enforce RequireAdminSessionManagementRole"
        );
    }
});
