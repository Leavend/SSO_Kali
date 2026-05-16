<?php

declare(strict_types=1);

use App\Http\Controllers\DataSubject\DataSubjectRequestController;
use App\Http\Controllers\Oidc\AuthorizeController;
use App\Http\Controllers\Oidc\ConsentController;
use App\Http\Controllers\Oidc\LocalLoginController;
use App\Http\Controllers\Resource\AuditController;
use App\Http\Controllers\Resource\ChangePasswordController;
use App\Http\Controllers\Resource\ProfileController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes (session-dependent)
|--------------------------------------------------------------------------
|
| These routes require the full web middleware stack (session, CSRF,
| cookie encryption) because they interact with browser sessions.
|
| Stateless OIDC endpoints (JWKS, discovery, token, userinfo, revocation,
| health, etc.) have been moved to routes/oidc.php for faster response.
|
*/

// --- OIDC Authorization (requires browser session for login state) ---
Route::middleware('throttle:oidc-authorize')->group(function (): void {
    Route::get('/authorize', AuthorizeController::class);
});

Route::prefix('/oauth2')->group(function (): void {
    Route::middleware('throttle:oidc-authorize')->get('/authorize', AuthorizeController::class);
});

// --- OIDC Consent (requires session to identify authenticated user) ---
Route::get('/connect/consent', [ConsentController::class, 'show'])->middleware('throttle:oidc-authorize');
Route::post('/connect/consent', [ConsentController::class, 'decide'])->middleware('throttle:oidc-authorize');

// --- Local Login (requires session to establish SSO session) ---
Route::post('/connect/local-login', LocalLoginController::class)->middleware('throttle:oidc-token');

// --- Profile APIs (require authenticated session) ---
Route::get('/api/profile', [ProfileController::class, 'show'])->middleware('throttle:profile-api');
Route::patch('/api/profile', [ProfileController::class, 'update'])->middleware('throttle:profile-api');
Route::post('/api/profile/change-password', ChangePasswordController::class)->middleware('throttle:profile-api');
Route::get('/api/profile/audit', AuditController::class)->middleware('throttle:profile-api');
Route::get('/api/profile/connected-apps', [ProfileController::class, 'connectedApps'])->middleware('throttle:profile-api');
Route::delete('/api/profile/connected-apps/{clientId}', [ProfileController::class, 'revokeConnectedApp'])->middleware('throttle:profile-api');
Route::get('/api/profile/sessions', [ProfileController::class, 'sessions'])->middleware('throttle:profile-api');
Route::delete('/api/profile/sessions', [ProfileController::class, 'revokeAllSessions'])->middleware('throttle:profile-api');
Route::delete('/api/profile/sessions/{sessionId}', [ProfileController::class, 'revokeSession'])->middleware('throttle:profile-api');

// --- Data Subject Rights (FR-049) ---
Route::get('/api/profile/data-subject-requests', [DataSubjectRequestController::class, 'index'])->middleware('throttle:profile-api');
Route::post('/api/profile/data-subject-requests', [DataSubjectRequestController::class, 'store'])->middleware('throttle:profile-api');
