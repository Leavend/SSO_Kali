<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\CompleteLogin;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class CallbackController
{
    public function __invoke(Request $request, CompleteLogin $action): RedirectResponse
    {
        return $action->handle($request);
    }
}
