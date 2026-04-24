<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\PerformLogout;
use Illuminate\Http\RedirectResponse;

final class LogoutController
{
    public function __invoke(PerformLogout $action): RedirectResponse
    {
        return $action->handle();
    }
}
