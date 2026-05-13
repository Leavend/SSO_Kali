<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mfa;

use App\Actions\Mfa\RegenerateRecoveryCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * FR-020 / UC-69: Recovery code management.
 *
 * POST /api/mfa/recovery-codes/regenerate
 */
final class RecoveryCodeController
{
    public function regenerate(Request $request, RegenerateRecoveryCodes $action): JsonResponse
    {
        $request->validate([
            'password' => ['required', 'string'],
        ]);

        try {
            $codes = $action->execute(
                $request->user(),
                $request->input('password'),
            );

            return response()->json([
                'regenerated' => true,
                'recovery_codes' => $codes,
            ]);
        } catch (RuntimeException $e) {
            return response()->json([
                'regenerated' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }
}
