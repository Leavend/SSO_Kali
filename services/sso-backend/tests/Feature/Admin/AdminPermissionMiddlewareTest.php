<?php

declare(strict_types=1);

use App\Http\Middleware\RequireAdminPermission;
use App\Models\AdminAuditEvent;
use App\Models\User;
use App\Support\Rbac\AdminPermission;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

it('rejects requests without admin context and audits the denial', function (): void {
    $response = handleAdminPermissionRequest(new Request);

    expect($response->getStatusCode())->toBe(401);

    $audit = AdminAuditEvent::query()->latest('id')->firstOrFail();

    expect($audit->action)->toBe('rbac_permission')
        ->and($audit->outcome)->toBe('denied')
        ->and($audit->reason)->toBe('missing_admin_context')
        ->and($audit->context)->toMatchArray(['permission' => AdminPermission::USERS_WRITE]);
});

it('rejects admins without required permission and audits safely', function (): void {
    $request = new Request(request: ['client_secret' => 'must-not-be-copied']);
    $request->attributes->set('admin_user', User::factory()->create(['role' => 'user']));

    $response = handleAdminPermissionRequest($request);

    expect($response->getStatusCode())->toBe(403);

    $audit = AdminAuditEvent::query()->latest('id')->firstOrFail();

    expect($audit->reason)->toBe('permission_required')
        ->and($audit->context)->toMatchArray(['permission' => AdminPermission::USERS_WRITE])
        ->and(json_encode($audit->context, JSON_THROW_ON_ERROR))->not->toContain('must-not-be-copied');
});

it('allows admins with required permission', function (): void {
    $request = new Request;
    $request->attributes->set('admin_user', User::factory()->create(['role' => 'admin']));

    $response = handleAdminPermissionRequest($request);

    expect($response->getStatusCode())->toBe(204);
});

function handleAdminPermissionRequest(Request $request): Response
{
    return app(RequireAdminPermission::class)->handle(
        $request,
        fn (): Response => response()->noContent(),
        AdminPermission::USERS_WRITE,
    );
}
