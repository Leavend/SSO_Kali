<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mfa;

use App\Models\MfaCredential;
use App\Services\Mfa\RecoveryCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * FR-018 / UC-66: MFA enrollment status.
 *
 * GET /api/mfa/status
 */
final class MfaStatusController
{
    public function __invoke(Request $request, RecoveryCodeService $recoveryCodes): JsonResponse
    {
        $user = $request->user();
        $userId = $user->getKey();

        $credential = MfaCredential::query()
            ->forUser($userId)
            ->totp()
            ->verified()
            ->first();

        $enrolled = $credential instanceof MfaCredential;

        return response()->json([
            'enrolled' => $enrolled,
            'methods' => $enrolled ? ['totp'] : [],
            'totp_verified_at' => $credential?->verified_at?->toIso8601String(),
            'recovery_codes_remaining' => $enrolled ? $recoveryCodes->remaining($userId) : 0,
        ]);
    }
}
