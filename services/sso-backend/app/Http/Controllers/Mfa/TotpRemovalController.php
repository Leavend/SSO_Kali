<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mfa;

use App\Actions\Mfa\RemoveTotpCredential;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * FR-018 / UC-66: Remove TOTP credential.
 *
 * DELETE /api/mfa/totp
 */
final class TotpRemovalController
{
    public function __invoke(Request $request, RemoveTotpCredential $action): JsonResponse
    {
        $request->validate([
            'password' => ['required', 'string'],
        ]);

        $user = $request->user();

        try {
            $action->execute($user, $request->input('password'));
        } catch (RuntimeException $e) {
            return response()->json([
                'removed' => false,
                'error' => $e->getMessage(),
            ], 422);
        }

        return response()->json(['removed' => true]);
    }
}
