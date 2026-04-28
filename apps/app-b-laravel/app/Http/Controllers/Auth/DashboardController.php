<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\EnsureFreshSession;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;

final class DashboardController
{
    public function __invoke(EnsureFreshSession $action): View|RedirectResponse
    {
        $session = $action->handle();

        if ($session === null) {
            return redirect('/?event=session-expired');
        }

        return view('dashboard', [
            'session' => $session,
            'user' => auth()->user(),
        ]);
    }
}
