<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\StartLogin;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class LoginController
{
    public function __invoke(Request $request, StartLogin $action): RedirectResponse
    {
        $prompt = is_string($request->query('prompt')) ? $request->query('prompt') : null;

        return $action->handle($prompt);
    }
}
