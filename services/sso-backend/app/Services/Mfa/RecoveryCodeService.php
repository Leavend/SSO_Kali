<?php

declare(strict_types=1);

namespace App\Services\Mfa;

use App\Models\MfaRecoveryCode;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * FR-018: Recovery code generation and verification.
 *
 * Generates 8 random codes, stores bcrypt hashes,
 * and provides single-use consumption.
 */
final class RecoveryCodeService
{
    private const int CODE_COUNT = 8;

    private const int CODE_LENGTH = 10;

    /**
     * Generate recovery codes for a user, replacing any existing ones.
     *
     * @return list<string> Plain-text codes (shown once to user)
     */
    public function generate(int $userId): array
    {
        // Invalidate existing codes
        MfaRecoveryCode::query()->forUser($userId)->delete();

        $plainCodes = [];

        for ($i = 0; $i < self::CODE_COUNT; $i++) {
            $code = $this->randomCode();
            $plainCodes[] = $code;

            MfaRecoveryCode::query()->create([
                'user_id' => $userId,
                'code_hash' => Hash::make($code),
                'created_at' => now(),
            ]);
        }

        return $plainCodes;
    }

    /**
     * Verify and consume a recovery code.
     */
    public function verify(int $userId, string $code): bool
    {
        $codes = MfaRecoveryCode::query()
            ->forUser($userId)
            ->unused()
            ->get();

        foreach ($codes as $stored) {
            if (Hash::check($code, $stored->code_hash)) {
                $stored->update(['used_at' => now()]);

                return true;
            }
        }

        return false;
    }

    /**
     * Count remaining unused codes for a user.
     */
    public function remaining(int $userId): int
    {
        return MfaRecoveryCode::query()
            ->forUser($userId)
            ->unused()
            ->count();
    }

    private function randomCode(): string
    {
        return Str::upper(Str::random(self::CODE_LENGTH));
    }
}
