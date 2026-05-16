<?php

declare(strict_types=1);

/**
 * OIDC Stateless Routes
 *
 * These endpoints are called server-to-server or by OIDC clients.
 * They do NOT need session, CSRF, or cookie encryption middleware.
 * Running them on a lightweight middleware stack eliminates ~200-500ms
 * of overhead per request from session/cookie processing.
 */

use App\Http\Controllers\OAuth\TokenRevocationController;
use App\Http\Controllers\Oidc\AdminPanelBackChannelLogoutController;
use App\Http\Controllers\Oidc\DiscoveryController;
use App\Http\Controllers\Oidc\JwksController;
use App\Http\Controllers\Oidc\RevocationController;
use App\Http\Controllers\Oidc\SessionLogoutController;
use App\Http\Controllers\Oidc\SessionRegistrationController;
use App\Http\Controllers\Oidc\TokenController;
use App\Http\Controllers\Oidc\UserInfoController;
use App\Http\Controllers\System\HealthController;
use App\Http\Controllers\System\PerformanceMetricsController;
use App\Http\Controllers\System\QueueMetricsController;
use App\Http\Controllers\System\ReadinessController;
use App\Http\Middleware\ApplyPublicCacheToMetadata;
use App\Http\Middleware\EnsureInternalMetricsToken;
use App\Http\Middleware\HandleDiscoveryErrors;
use App\Http\Middleware\ValidateTokenOrigin;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Route;

// --- System / Health ---
Route::get('/', function (): JsonResponse {
    return response()->json([
        'service' => 'sso-backend',
        'status' => 'ok',
        'engine' => config('sso.engine'),
        'issuer' => config('sso.issuer'),
    ]);
});
Route::get('/health', HealthController::class);
Route::get('/ready', ReadinessController::class);
Route::get('/_internal/performance-metrics', PerformanceMetricsController::class)
    ->middleware(EnsureInternalMetricsToken::class);
Route::get('/_internal/queue-metrics', QueueMetricsController::class)
    ->middleware(EnsureInternalMetricsToken::class);

// --- OIDC Discovery & JWKS (public, cacheable) ---
Route::get('/.well-known/openid-configuration', DiscoveryController::class)
    ->middleware([HandleDiscoveryErrors::class, ApplyPublicCacheToMetadata::class, 'throttle:oidc-discovery']);
Route::get('/.well-known/jwks.json', JwksController::class)
    ->middleware([HandleDiscoveryErrors::class, ApplyPublicCacheToMetadata::class, 'throttle:oidc-jwks']);
Route::get('/jwks', JwksController::class)
    ->middleware([HandleDiscoveryErrors::class, ApplyPublicCacheToMetadata::class, 'throttle:oidc-jwks']);

// --- OIDC Token Exchange (client-authenticated, not browser session) ---
Route::post('/token', TokenController::class)->middleware(['throttle:oidc-token', ValidateTokenOrigin::class]);
Route::match(['get', 'post'], '/userinfo', UserInfoController::class)->middleware('throttle:oidc-resource');
Route::post('/revocation', RevocationController::class)->middleware('throttle:oidc-token');
Route::post('/oauth/revoke', TokenRevocationController::class)->middleware('throttle:oidc-token');

// --- OIDC Session Management (server-to-server) ---
Route::post('/connect/register-session', SessionRegistrationController::class)->middleware('throttle:oidc-callback');
Route::match(['get', 'post'], '/connect/logout', SessionLogoutController::class)->middleware('throttle:oidc-callback');
Route::post('/connect/backchannel/admin-panel/logout', AdminPanelBackChannelLogoutController::class)->middleware('throttle:oidc-callback');

// --- OAuth2 aliases ---
Route::prefix('/oauth2')->group(function (): void {
    Route::post('/token', TokenController::class)->middleware(['throttle:oidc-token', ValidateTokenOrigin::class]);
    Route::post('/revocation', RevocationController::class)->middleware('throttle:oidc-token');
});
