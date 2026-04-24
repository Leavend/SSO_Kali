<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\ClientController;
use App\Http\Controllers\Admin\PrincipalController;
use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Middleware\AdminGuard;
use App\Http\Middleware\EnsureAdminMfaAssurance;
use App\Http\Middleware\EnsureFreshAdminAuth;
use App\Http\Middleware\RequireAdminSessionManagementRole;
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
    });

    // Write endpoints — 10 req/min per admin (destructive actions)
    Route::middleware([
        'throttle:admin-write',
        RequireAdminSessionManagementRole::class,
        EnsureFreshAdminAuth::class.':step_up',
        EnsureAdminMfaAssurance::class,
    ])->group(function (): void {
        Route::delete('/sessions/{sessionId}', [SessionController::class, 'destroy'])
            ->where('sessionId', '[a-zA-Z0-9_-]+');
        Route::delete('/users/{subjectId}/sessions', [SessionController::class, 'destroyUserSessions'])
            ->where('subjectId', '[a-zA-Z0-9_-]+');
    });
});
