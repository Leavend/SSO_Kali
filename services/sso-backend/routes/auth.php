<?php

declare(strict_types=1);

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\Auth\SessionController;
use App\Http\Controllers\Mfa\MfaChallengeController;
use App\Http\Controllers\Mfa\MfaStatusController;
use App\Http\Controllers\Mfa\RecoveryCodeController;
use App\Http\Controllers\Mfa\TotpEnrollmentController;
use App\Http\Controllers\Mfa\TotpRemovalController;
use App\Http\Middleware\EnsureMfaReenrollmentCompleted;
use App\Http\Middleware\ResolveSsoSessionUser;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/login', function (Request $request): RedirectResponse {
    $target = rtrim((string) config('sso.login_url'), '/');
    $returnTo = $request->query('return_to');

    if (! is_string($returnTo) || $returnTo === '') {
        $intended = $request->session()->get('url.intended');
        $returnTo = is_string($intended) && $intended !== '' ? $intended : $request->fullUrl();
        $returnTo = str_replace($request->getSchemeAndHttpHost().'/login', $request->getSchemeAndHttpHost().'/oauth/authorize', $returnTo);
    }

    $returnHost = parse_url($returnTo, PHP_URL_HOST);
    if (! is_string($returnHost) || $returnHost !== $request->getHost()) {
        $returnTo = $request->getSchemeAndHttpHost().'/oauth/authorize';
    }

    $query = ['return_to' => $returnTo];

    return redirect()->away($target.'?'.http_build_query($query));
})->name('login');

Route::prefix('api/auth')->group(function (): void {
    Route::get('/session', SessionController::class)->middleware('throttle:oidc-resource');
    Route::post('/login', LoginController::class)->middleware('throttle:oidc-callback');
    Route::post('/logout', LogoutController::class)->middleware('throttle:oidc-callback');
    Route::post('/register', RegisterController::class)->middleware('throttle:oidc-callback');
});

Route::prefix('api/mfa')->middleware(['throttle:profile-api', ResolveSsoSessionUser::class, EnsureMfaReenrollmentCompleted::class])->group(function (): void {
    Route::get('/status', MfaStatusController::class);
    Route::post('/totp/enroll', [TotpEnrollmentController::class, 'store']);
    Route::post('/totp/verify', [TotpEnrollmentController::class, 'verify']);
    Route::delete('/totp', TotpRemovalController::class);
    Route::post('/recovery-codes/regenerate', [RecoveryCodeController::class, 'regenerate']);
});

// Challenge verification does not require an active session (user is mid-login)
Route::post('/api/mfa/challenge/verify', MfaChallengeController::class)->middleware('throttle:profile-api');
