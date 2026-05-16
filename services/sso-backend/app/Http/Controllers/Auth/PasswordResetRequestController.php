<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\RequestPasswordResetAction;
use App\Http\Requests\Auth\RequestPasswordResetRequest;
use Illuminate\Http\JsonResponse;

final class PasswordResetRequestController
{
    public function __invoke(RequestPasswordResetRequest $request, RequestPasswordResetAction $action): JsonResponse
    {
        $action->execute((string) $request->validated('email'));

        return response()->json([
            'message' => 'Jika email terdaftar, instruksi reset password akan dikirim.',
            'sent' => true,
        ]);
    }
}
