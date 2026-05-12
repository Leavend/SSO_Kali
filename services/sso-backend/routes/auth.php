<?php

declare(strict_types=1);

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\Auth\SessionController;
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
