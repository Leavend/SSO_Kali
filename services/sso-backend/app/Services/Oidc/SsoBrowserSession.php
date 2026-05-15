<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use Illuminate\Http\Request;

final class SsoBrowserSession
{
    private const string KEY = 'sso_browser_session';

    /**
     * @param  array<string, mixed>  $authContext
     */
    public function remember(Request $request, string $subjectId, string $sessionId, array $authContext): void
    {
        if (! $request->hasSession()) {
            return;
        }

        $request->session()->put(self::KEY, [
            'subject_id' => $subjectId,
            'session_id' => $sessionId,
            'auth_time' => $authContext['auth_time'] ?? time(),
            'amr' => $this->stringList($authContext['amr'] ?? []),
            'acr' => $this->optionalString($authContext['acr'] ?? null),
        ]);
    }

    /**
     * FR-022: Forget the browser session payload when the underlying
     * account state has become invalid so the next authorization request
     * forces a fresh credential check.
     */
    public function forget(Request $request): void
    {
        if (! $request->hasSession()) {
            return;
        }

        $request->session()->forget(self::KEY);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function context(Request $request): ?array
    {
        if (! $request->hasSession()) {
            return null;
        }

        $payload = $request->session()->get(self::KEY);
        if (! is_array($payload)) {
            return null;
        }

        $subjectId = $this->requiredString($payload, 'subject_id');
        $sessionId = $this->requiredString($payload, 'session_id');
        if ($subjectId === null || $sessionId === null) {
            return null;
        }

        return $this->payload($payload, $subjectId, $sessionId);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function payload(array $payload, string $subjectId, string $sessionId): array
    {
        return array_filter([
            'subject_id' => $subjectId,
            'session_id' => $sessionId,
            'auth_time' => $this->timestamp($payload['auth_time'] ?? null),
            'amr' => $this->stringList($payload['amr'] ?? []),
            'acr' => $this->optionalString($payload['acr'] ?? null),
        ], static fn (mixed $value): bool => $value !== null && $value !== []);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function requiredString(array $payload, string $key): ?string
    {
        $value = $payload[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    private function timestamp(mixed $value): ?int
    {
        return is_int($value) ? $value : null;
    }

    /**
     * @return list<string>
     */
    private function stringList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, static fn (mixed $item): bool => is_string($item) && $item !== ''));
    }
}
