<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mfa;

use App\Actions\Mfa\ConfirmTotpEnrollment;
use App\Actions\Mfa\StartTotpEnrollment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * FR-018 / UC-66: TOTP enrollment endpoints.
 *
 * POST /api/mfa/totp/enroll  — start enrollment
 * POST /api/mfa/totp/verify  — confirm enrollment
 */
final class TotpEnrollmentController
{
    public function store(Request $request, StartTotpEnrollment $action): JsonResponse
    {
        $user = $request->user();
        $result = $action->execute($user);

        return response()->json([
            'secret' => $result['secret'],
            'provisioning_uri' => $result['provisioning_uri'],
        ], 201);
    }

    public function verify(Request $request, ConfirmTotpEnrollment $action): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $user = $request->user();

        try {
            $result = $action->execute($user, $request->input('code'));
        } catch (RuntimeException $e) {
            return response()->json([
                'verified' => false,
                'error' => $e->getMessage(),
            ], 422);
        }

        return response()->json($result);
    }
}
