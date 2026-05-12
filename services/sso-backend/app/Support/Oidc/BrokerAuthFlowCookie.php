<?php

declare(strict_types=1);

namespace App\Support\Oidc;

use Illuminate\Http\Request;
use JsonException;
use Symfony\Component\HttpFoundation\Cookie;

final class BrokerAuthFlowCookie
{
    public const string NAME = '__Host-broker_auth_flow';

    /**
     * @param  array<string, mixed>  $context
     */
    public function issue(array $context): Cookie
    {
        return Cookie::create(
            self::NAME,
            $this->encode($context),
            now()->addSeconds($this->ttlSeconds()),
            '/',
            null,
            true,
            true,
            false,
            Cookie::SAMESITE_LAX,
        );
    }

    /**
     * @return array{client_id: string, redirect_uri: string, original_state: ?string}|null
     */
    public function read(Request $request): ?array
    {
        $payload = $request->cookies->get(self::NAME);

        if (! is_string($payload) || $payload === '') {
            return null;
        }

        try {
            $decoded = json_decode($payload, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }

        return $this->validContext($decoded) ? $decoded : null;
    }

    public function expire(): Cookie
    {
        return Cookie::create(self::NAME, '', now()->subMinute(), '/', null, true, true, false, Cookie::SAMESITE_LAX);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function encode(array $context): string
    {
        return json_encode([
            'client_id' => (string) ($context['client_id'] ?? ''),
            'redirect_uri' => (string) ($context['redirect_uri'] ?? ''),
            'original_state' => is_string($context['original_state'] ?? null) ? $context['original_state'] : null,
        ], JSON_THROW_ON_ERROR);
    }

    private function ttlSeconds(): int
    {
        $configured = (int) config('sso.stores.auth_request_fallback_seconds', 0);

        return $configured > 0 ? $configured : ((int) config('sso.stores.auth_request_seconds', 900) + 900);
    }

    private function validContext(mixed $decoded): bool
    {
        return is_array($decoded)
            && is_string($decoded['client_id'] ?? null)
            && $decoded['client_id'] !== ''
            && is_string($decoded['redirect_uri'] ?? null)
            && $decoded['redirect_uri'] !== ''
            && filter_var($decoded['redirect_uri'], FILTER_VALIDATE_URL) !== false
            && (! array_key_exists('original_state', $decoded) || is_string($decoded['original_state']) || $decoded['original_state'] === null);
    }
}
