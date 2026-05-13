<?php

declare(strict_types=1);

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * FR-015 / ISSUE-02: Enterprise password policy.
 *
 * Requirements:
 * - Minimum 12 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character
 * - Maximum 128 characters
 */
final class StrongPassword implements ValidationRule
{
    /**
     * @param  Closure(string, ?string=): void  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            $fail('Password harus berupa string.');

            return;
        }

        if (mb_strlen($value) < 12) {
            $fail('Password minimal 12 karakter.');

            return;
        }

        if (mb_strlen($value) > 128) {
            $fail('Password maksimal 128 karakter.');

            return;
        }

        if (! preg_match('/[A-Z]/', $value)) {
            $fail('Password harus mengandung minimal 1 huruf besar.');

            return;
        }

        if (! preg_match('/[a-z]/', $value)) {
            $fail('Password harus mengandung minimal 1 huruf kecil.');

            return;
        }

        if (! preg_match('/[0-9]/', $value)) {
            $fail('Password harus mengandung minimal 1 angka.');

            return;
        }

        if (! preg_match('/[^A-Za-z0-9]/', $value)) {
            $fail('Password harus mengandung minimal 1 karakter spesial.');
        }
    }
}
