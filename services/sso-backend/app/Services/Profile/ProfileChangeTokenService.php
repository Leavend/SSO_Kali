<?php

declare(strict_types=1);

namespace App\Services\Profile;

use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final class ProfileChangeTokenService
{
    public function token(): string
    {
        return Str::random(48);
    }

    public function otp(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    public function hash(string $secret): string
    {
        return Hash::make($secret);
    }

    public function matches(?string $hash, string $secret): bool
    {
        return is_string($hash) && $hash !== '' && Hash::check($secret, $hash);
    }

    public function ttlMinutes(): int
    {
        return max(1, (int) config('sso.profile_change_ttl_minutes', 30));
    }
}
