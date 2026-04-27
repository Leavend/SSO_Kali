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
            return redirect('/?event=session-expired');
        }

        return view('dashboard', [
            'session' => $session,
            'user' => auth()->user(),
        ]);
    }
}
