<?php

declare(strict_types=1);

namespace App\Services\Sso;

final class PkceService
{
    /**
     * @return array<string, string>
     */
    public function transaction(): array
    {
        $verifier = $this->random(48);

        return [
            'state' => $this->random(24),
            'nonce' => $this->random(16),
            'code_verifier' => $verifier,
            'code_challenge' => $this->challenge($verifier),
        ];
    }

    private function random(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    private function challenge(string $verifier): string
    {
        return rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    }
}
