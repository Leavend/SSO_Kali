<?php

declare(strict_types=1);

use App\Http\Controllers\OAuth\TokenRevocationController;
use App\Http\Controllers\Oidc\AdminPanelBackChannelLogoutController;
use App\Http\Controllers\Oidc\AuthorizeController;
use App\Http\Controllers\Oidc\DiscoveryController;
use App\Http\Controllers\Oidc\JwksController;
use App\Http\Controllers\Oidc\RevocationController;
use App\Http\Controllers\Oidc\SessionLogoutController;
use App\Http\Controllers\Oidc\SessionRegistrationController;
use App\Http\Controllers\Oidc\TokenController;
use App\Http\Controllers\Oidc\UserInfoController;
use App\Http\Controllers\Resource\ProfileController;
use App\Http\Controllers\System\HealthController;
use App\Http\Controllers\System\PerformanceMetricsController;
use App\Http\Controllers\System\ReadinessController;
use App\Http\Middleware\ApplyPublicCacheToMetadata;
use App\Http\Middleware\HandleDiscoveryErrors;
use App\Http\Middleware\ValidateTokenOrigin;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Route;

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
Route::get('/_internal/performance-metrics', PerformanceMetricsController::class);
Route::get('/.well-known/openid-configuration', DiscoveryController::class)
    ->middleware([HandleDiscoveryErrors::class, ApplyPublicCacheToMetadata::class.':300', 'throttle:oidc-discovery']);
Route::get('/.well-known/jwks.json', JwksController::class)
    ->middleware([HandleDiscoveryErrors::class, ApplyPublicCacheToMetadata::class.':300', 'throttle:oidc-jwks']);
Route::get('/jwks', JwksController::class)
    ->middleware([HandleDiscoveryErrors::class, ApplyPublicCacheToMetadata::class.':300', 'throttle:oidc-jwks']);
Route::post('/token', TokenController::class)->middleware(['throttle:oidc-token', ValidateTokenOrigin::class]);
Route::match(['get', 'post'], '/userinfo', UserInfoController::class)->middleware('throttle:oidc-resource');
Route::post('/revocation', RevocationController::class)->middleware('throttle:oidc-token');
Route::post('/oauth/revoke', TokenRevocationController::class)->middleware('throttle:oidc-token');
Route::post('/connect/register-session', SessionRegistrationController::class)->middleware('throttle:oidc-callback');
Route::post('/connect/logout', SessionLogoutController::class)->middleware('throttle:oidc-callback');
Route::post('/connect/backchannel/admin-panel/logout', AdminPanelBackChannelLogoutController::class)->middleware('throttle:oidc-callback');
Route::get('/api/profile', ProfileController::class)->middleware('throttle:oidc-resource');

Route::middleware('throttle:oidc-authorize')->group(function (): void {
    Route::get('/authorize', AuthorizeController::class);
});

Route::prefix('/oauth2')->group(function (): void {
    Route::middleware('throttle:oidc-authorize')->get('/authorize', AuthorizeController::class);
    Route::post('/token', TokenController::class)->middleware(['throttle:oidc-token', ValidateTokenOrigin::class]);
    Route::post('/revocation', RevocationController::class)->middleware('throttle:oidc-token');
});
