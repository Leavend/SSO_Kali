<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\AuditTrailController;
use App\Http\Controllers\Admin\ClientController;
use App\Http\Controllers\Admin\ClientIntegrationController;
use App\Http\Controllers\Admin\ExternalIdentityProviderController;
use App\Http\Controllers\Admin\PrincipalController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Middleware\AdminGuard;
use App\Http\Middleware\EnsureAdminMfaAssurance;
use App\Http\Middleware\EnsureFreshAdminAuth;
use App\Http\Middleware\RequireAdminPermission;
use App\Http\Middleware\RequireAdminSessionManagementRole;
use App\Support\Rbac\AdminPermission;
use Illuminate\Support\Facades\Route;

Route::middleware(AdminGuard::class)->prefix('admin/api')->group(function (): void {
    Route::middleware([
        'throttle:admin-bootstrap',
        EnsureFreshAdminAuth::class.':read',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::get('/me', [PrincipalController::class, 'show']);
    });

    // Read endpoints — 60 req/min per admin
    Route::middleware([
        'throttle:admin-read',
        EnsureFreshAdminAuth::class.':read',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::get('/users', [UserController::class, 'index']);
        Route::get('/users/{subjectId}', [UserController::class, 'show'])
            ->where('subjectId', '[a-zA-Z0-9_-]+');
        Route::get('/sessions', [SessionController::class, 'index']);
        Route::get('/sessions/{sessionId}', [SessionController::class, 'show'])
            ->where('sessionId', '[a-zA-Z0-9_-]+');
        Route::get('/clients', [ClientController::class, 'index']);
        Route::get('/clients/{clientId}', [ClientController::class, 'show'])
            ->where('clientId', '[a-z0-9-]+');
        Route::get('/scopes', [ClientController::class, 'scopes']);
        Route::get('/client-integrations/registrations', [ClientIntegrationController::class, 'registrations']);
        Route::post('/client-integrations/contract', [ClientIntegrationController::class, 'contract']);
    });

    Route::middleware([
        'throttle:admin-read',
        RequireAdminPermission::class.':'.AdminPermission::EXTERNAL_IDPS_READ,
        EnsureFreshAdminAuth::class.':read',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::get('/external-idps', [ExternalIdentityProviderController::class, 'index']);
        Route::get('/external-idps/{providerKey}', [ExternalIdentityProviderController::class, 'show'])
            ->where('providerKey', '[a-z0-9_-]+');
    });
    Route::middleware([
        'throttle:admin-read',
        RequireAdminPermission::class.':'.AdminPermission::AUDIT_READ,
        EnsureFreshAdminAuth::class.':read',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::get('/audit/events', [AuditTrailController::class, 'index']);
        Route::get('/audit/events/{eventId}', [AuditTrailController::class, 'show'])
            ->where('eventId', '[A-Z0-9]+');
        Route::get('/audit/integrity', [AuditTrailController::class, 'integrity']);
    });

    Route::middleware([
        'throttle:admin-read',
        RequireAdminPermission::class.':'.AdminPermission::ROLES_READ,
        EnsureFreshAdminAuth::class.':read',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::get('/roles', [RoleController::class, 'index']);
        Route::get('/permissions', [RoleController::class, 'permissions']);
    });

    Route::middleware([
        'throttle:admin-write',
        RequireAdminPermission::class.':'.AdminPermission::ROLES_WRITE,
        EnsureFreshAdminAuth::class.':step_up',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::post('/roles', [RoleController::class, 'store']);
        Route::patch('/roles/{role}', [RoleController::class, 'update'])
            ->where('role', '[a-z0-9_-]+');
        Route::put('/roles/{role}/permissions', [RoleController::class, 'syncPermissions'])
            ->where('role', '[a-z0-9_-]+');
        Route::put('/users/{subjectId}/roles', [RoleController::class, 'syncUserRoles'])
            ->where('subjectId', '[a-zA-Z0-9_-]+');
    });

    Route::middleware([
        'throttle:admin-write',
        RequireAdminPermission::class.':'.AdminPermission::USERS_WRITE,
        EnsureFreshAdminAuth::class.':step_up',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::post('/users', [UserController::class, 'store']);
        Route::post('/users/{subjectId}/deactivate', [UserController::class, 'deactivate'])
            ->where('subjectId', '[a-zA-Z0-9_-]+');
        Route::post('/users/{subjectId}/reactivate', [UserController::class, 'reactivate'])
            ->where('subjectId', '[a-zA-Z0-9_-]+');
        Route::post('/users/{subjectId}/password-reset', [UserController::class, 'issuePasswordReset'])
            ->where('subjectId', '[a-zA-Z0-9_-]+');
        Route::post('/users/{subjectId}/sync-profile', [UserController::class, 'syncProfile'])
            ->where('subjectId', '[a-zA-Z0-9_-]+');
    });

    Route::middleware([
        'throttle:admin-write',
        RequireAdminPermission::class.':'.AdminPermission::CLIENTS_WRITE,
        EnsureFreshAdminAuth::class.':step_up',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::patch('/clients/{clientId}', [ClientController::class, 'update'])
            ->where('clientId', '[a-z0-9-]+');
        Route::put('/clients/{clientId}/scopes', [ClientController::class, 'syncScopes'])
            ->where('clientId', '[a-z0-9-]+');
    });

    Route::middleware([
        'throttle:admin-write',
        RequireAdminPermission::class.':'.AdminPermission::EXTERNAL_IDPS_WRITE,
        EnsureFreshAdminAuth::class.':step_up',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::post('/external-idps', [ExternalIdentityProviderController::class, 'store']);
        Route::patch('/external-idps/{providerKey}', [ExternalIdentityProviderController::class, 'update'])
            ->where('providerKey', '[a-z0-9_-]+');
    });

    Route::middleware([
        'throttle:admin-write',
        RequireAdminSessionManagementRole::class,
        RequireAdminPermission::class.':'.AdminPermission::SESSIONS_TERMINATE,
        EnsureFreshAdminAuth::class.':step_up',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::delete('/roles/{role}', [RoleController::class, 'destroy'])
            ->middleware(RequireAdminPermission::class.':'.AdminPermission::ROLES_WRITE)
            ->where('role', '[a-z0-9_-]+');
        Route::delete('/clients/{clientId}', [ClientController::class, 'destroy'])
            ->middleware(RequireAdminPermission::class.':'.AdminPermission::CLIENTS_WRITE)
            ->where('clientId', '[a-z0-9-]+');
        Route::delete('/sessions/{sessionId}', [SessionController::class, 'destroy'])
            ->where('sessionId', '[a-zA-Z0-9_-]+');
        Route::delete('/users/{subjectId}/sessions', [SessionController::class, 'destroyUserSessions'])
            ->where('subjectId', '[a-zA-Z0-9_-]+');
        Route::post('/client-integrations/stage', [ClientIntegrationController::class, 'stage']);
        Route::post('/client-integrations/{clientId}/activate', [ClientIntegrationController::class, 'activate'])
            ->where('clientId', '[a-z0-9-]+');
        Route::post('/client-integrations/{clientId}/disable', [ClientIntegrationController::class, 'disable'])
            ->where('clientId', '[a-z0-9-]+');
        Route::delete('/external-idps/{providerKey}', [ExternalIdentityProviderController::class, 'destroy'])
            ->middleware(RequireAdminPermission::class.':'.AdminPermission::EXTERNAL_IDPS_WRITE)
            ->where('providerKey', '[a-z0-9_-]+');
    });
});
