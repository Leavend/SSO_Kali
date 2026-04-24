<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Services\Sso\AppSessionStore;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;

final class DashboardController
{
    public function __invoke(AppSessionStore $sessions): View|RedirectResponse
    {
        $session = $sessions->current();

        if ($session === null) {
            return redirect('/')->with('status', 'Sesi App B belum tersedia atau sudah diputus.');
        }

        return view('dashboard', [
            'session' => $session,
            'user' => auth()->user(),
        ]);
    }
}
