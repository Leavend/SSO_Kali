<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Crypto\Base64Url;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use RuntimeException;

final class SigningKeyService
{
    /**
     * @param  array<string, mixed>  $claims
     */
    public function sign(array $claims): string
    {
        $material = $this->material();

        return JWT::encode($claims, $material['private'], $this->algorithm(), $material['kid']);
    }

    /**
     * @return array<string, mixed>
     */
    public function decode(string $token): array
    {
        $decoded = JWT::decode($token, new Key($this->material()['public'], $this->algorithm()));

        return json_decode(json_encode($decoded, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @return array<string, mixed>
     */
    public function jwks(): array
    {
        $details = $this->details();

        return [
            'keys' => [[
                'kty' => 'EC',
                'use' => 'sig',
                'alg' => $this->algorithm(),
                'kid' => $this->material()['kid'],
                'crv' => 'P-256',
                'x' => Base64Url::encode((string) $details['ec']['x']),
                'y' => Base64Url::encode((string) $details['ec']['y']),
            ]],
        ];
    }

    /**
     * @return array{private: string, public: string, kid: string}
     */
    private function material(): array
    {
        $this->ensureKeys();
        $private = file_get_contents((string) config('sso.signing.private_key_path'));
        $public = file_get_contents((string) config('sso.signing.public_key_path'));

        if (! is_string($private) || ! is_string($public)) {
            throw new RuntimeException('OIDC signing keys could not be loaded.');
        }

        return [
            'private' => $private,
            'public' => $public,
            'kid' => (string) config('sso.signing.kid'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function details(): array
    {
        $key = openssl_pkey_get_private($this->material()['private']);
        $details = $key ? openssl_pkey_get_details($key) : false;

        if (! is_array($details)) {
            throw new RuntimeException('OIDC public key details are invalid.');
        }

        return $details;
    }

    private function ensureKeys(): void
    {
        if ($this->keysExist()) {
            return;
        }

        if (! $this->isLocalEnvironment()) {
            throw new RuntimeException(
                'OIDC signing keys are missing. In production, keys must be explicitly provisioned.',
            );
        }

        $this->generateKeys();
    }

    private function generateKeys(): void
    {
        $directory = dirname((string) config('sso.signing.private_key_path'));
        is_dir($directory) || mkdir($directory, 0755, true);

        $key = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);

        if ($key === false) {
            throw new RuntimeException('OIDC private key generation failed.');
        }

        openssl_pkey_export($key, $private);
        $details = openssl_pkey_get_details($key);

        file_put_contents((string) config('sso.signing.private_key_path'), $private);
        file_put_contents((string) config('sso.signing.public_key_path'), (string) $details['key']);
    }

    private function isLocalEnvironment(): bool
    {
        return in_array(app()->environment(), ['local', 'testing'], true);
    }

    private function keysExist(): bool
    {
        return file_exists((string) config('sso.signing.private_key_path'))
            && file_exists((string) config('sso.signing.public_key_path'));
    }

    private function algorithm(): string
    {
        return (string) config('sso.signing.alg', 'ES256');
    }
}
