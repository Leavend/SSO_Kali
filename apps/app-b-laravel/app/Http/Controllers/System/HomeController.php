<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use App\Services\Sso\AppSessionStore;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class HomeController
{
    public function __invoke(Request $request, AppSessionStore $sessions): View|RedirectResponse
    {
        if ($sessions->current() !== null) {
            return redirect('/dashboard');
        }

        // Touchless SSO: if no local session and not yet attempted silent check,
        // auto-redirect to broker with prompt=none to check for existing ZITADEL session.
        if ($request->query('sso_checked') !== '1' && ! $request->session()->has('status')) {
            return redirect('/auth/login?prompt=none');
        }

        return view('home', [
            'clientId' => config('services.sso.client_id'),
            'issuer' => config('services.sso.public_issuer'),
            'callbackUri' => config('services.sso.redirect_uri'),
        ]);
    }
}
