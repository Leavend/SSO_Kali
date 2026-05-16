<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\ConfirmPasswordResetAction;
use App\Http\Requests\Auth\ConfirmPasswordResetRequest;
use Illuminate\Http\JsonResponse;

final class PasswordResetConfirmController
{
    public function __invoke(ConfirmPasswordResetRequest $request, ConfirmPasswordResetAction $action): JsonResponse
    {
        $action->execute(
            $request,
            (string) $request->validated('email'),
            (string) $request->validated('token'),
            (string) $request->validated('password'),
        );

        return response()->json([
            'message' => 'Password berhasil direset. Semua sesi aktif telah dicabut.',
            'sessions_revoked' => true,
        ]);
    }
}
