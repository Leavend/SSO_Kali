<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Crypto\UpstreamTokenEncryptor;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class RefreshTokenStore
{
    public function __construct(
        private readonly UpstreamTokenEncryptor $encryptor,
    ) {}

    /**
     * @return array{id: string, token: string}
     */
    public function issue(
        string $subjectId,
        string $clientId,
        string $scope,
        string $sessionId,
        ?string $upstreamRefreshToken,
        int $authTime,
        array $amr = [],
        ?string $acr = null,
        ?string $familyId = null,
        ?int $familyCreatedAt = null,
    ): array {
        $tokenId = (string) Str::uuid();
        $secret = bin2hex(random_bytes(32));
        $tokenFamilyId = $familyId ?? (string) Str::uuid();

        DB::table('refresh_token_rotations')->insert($this->issuePayload(
            $subjectId,
            $clientId,
            $scope,
            $sessionId,
            $upstreamRefreshToken,
            $authTime,
            $amr,
            $acr,
            $tokenId,
            $tokenFamilyId,
            $secret,
            $familyCreatedAt,
        ));

        return ['id' => $tokenId, 'token' => $this->plainToken($tokenId, $secret)];
    }

    /**
     * @param  list<string>  $amr
     * @return array<string, mixed>
     */
    private function issuePayload(
        string $subjectId,
        string $clientId,
        string $scope,
        string $sessionId,
        ?string $upstreamRefreshToken,
        int $authTime,
        array $amr,
        ?string $acr,
        string $tokenId,
        string $tokenFamilyId,
        string $secret,
        ?int $familyCreatedAt,
    ): array {
        return [
            'subject_id' => $subjectId,
            'subject_uuid' => $subjectId,
            'client_id' => $clientId,
            'refresh_token_id' => $tokenId,
            'token_family_id' => $tokenFamilyId,
            'family_created_at' => $this->familyCreatedAt($familyCreatedAt),
            'secret_hash' => hash('sha256', $secret),
            'scope' => $scope,
            'session_id' => $sessionId,
            'auth_time' => CarbonImmutable::createFromTimestamp($authTime),
            'amr' => $this->encodeAmr($amr),
            'acr' => $acr,
            'upstream_refresh_token' => $this->encrypt($upstreamRefreshToken),
            'expires_at' => now()->addDays((int) config('sso.ttl.refresh_token_days', 30)),
            'replaced_by_token_id' => null,
            'revoked_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findActive(string $plainToken, string $clientId): ?array
    {
        return $this->resolveActive($plainToken, $clientId)['record'];
    }

    /**
     * Resolve the active record alongside an explicit reuse signal so
     * callers (e.g. ExchangeToken) can emit dedicated reuse-detected
     * audit events when a previously rotated token is replayed.
     *
     * @return array{record: array<string, mixed>|null, reuse: bool, family_id: string|null, token_id: string|null}
     */
    public function resolveActive(string $plainToken, string $clientId): array
    {
        [$tokenId, $secret] = $this->parse($plainToken);

        if ($tokenId === null || $secret === null) {
            return ['record' => null, 'reuse' => false, 'family_id' => null, 'token_id' => null];
        }

        $record = DB::table('refresh_token_rotations')
            ->where('refresh_token_id', $tokenId)
            ->where('client_id', $clientId)
            ->first();

        if ($record === null) {
            return ['record' => null, 'reuse' => false, 'family_id' => null, 'token_id' => $tokenId];
        }

        $familyId = (string) $record->token_family_id;

        if ($this->isReuse($record, $secret)) {
            $this->revokeFamily($familyId);

            return [
                'record' => null,
                'reuse' => true,
                'family_id' => $familyId,
                'token_id' => $tokenId,
            ];
        }

        if ($this->familyExpired($record)) {
            $this->revokeExpiredFamily($familyId);

            return [
                'record' => null,
                'reuse' => false,
                'family_id' => $familyId,
                'token_id' => $tokenId,
            ];
        }

        return [
            'record' => $this->validRecord($record, $secret) ? $this->payload($record) : null,
            'reuse' => false,
            'family_id' => $familyId,
            'token_id' => $tokenId,
        ];
    }

    /**
     * Atomically claim the active refresh token row by setting revoked_at
     * in a single UPDATE keyed on the token id and the still-null
     * revoked_at column. Returns true only when the claim succeeds — i.e.
     * the caller now owns the right to issue the rotation.
     */
    public function atomicClaim(string $tokenId, string $replacementId): bool
    {
        return DB::table('refresh_token_rotations')
            ->where('refresh_token_id', $tokenId)
            ->whereNull('revoked_at')
            ->update([
                'replaced_by_token_id' => $replacementId,
                'revoked_at' => now(),
                'updated_at' => now(),
            ]) === 1;
    }

    /**
     * OAuth 2.1 §6.1 — Reuse Detection.
     *
     * A token that has been revoked AND replaced is considered
     * "legitimately rotated".  If someone presents it again the
     * secret will still match, but revoked_at is set — this is
     * a replay of a stolen token.  Revoke the entire family.
     */
    private function isReuse(object $record, string $secret): bool
    {
        $secretMatches = hash_equals(
            (string) $record->secret_hash,
            hash('sha256', $secret),
        );

        return $secretMatches
            && $record->revoked_at !== null
            && $record->replaced_by_token_id !== null;
    }

    private function revokeFamily(string $familyId): void
    {
        DB::table('refresh_token_rotations')
            ->where('token_family_id', $familyId)
            ->whereNull('revoked_at')
            ->update([
                'revoked_at' => now(),
                'updated_at' => now(),
            ]);

        Log::warning('Refresh token reuse detected — family revoked', [
            'token_family_id' => $familyId,
        ]);
    }

    public function revoke(string $tokenId, ?string $replacementId = null): void
    {
        DB::table('refresh_token_rotations')
            ->where('refresh_token_id', $tokenId)
            ->update([
                'replaced_by_token_id' => $replacementId,
                'revoked_at' => now(),
                'updated_at' => now(),
            ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function revokeSession(string $sessionId): array
    {
        return $this->revokeRecords(
            $this->activeRecords()->where('session_id', $sessionId)->get()->all(),
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function revokeSubject(string $subjectId): array
    {
        return $this->revokeRecords(
            $this->activeRecords()->where('subject_id', $subjectId)->get()->all(),
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function revokeClientSessionsForSubject(string $subjectId, string $clientId): array
    {
        return $this->revokeRecords(
            $this->activeRecords()
                ->where('subject_id', $subjectId)
                ->where('client_id', $clientId)
                ->get()
                ->all(),
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function revokeClientSession(string $sessionId, string $clientId): array
    {
        return $this->revokeRecords(
            $this->activeRecords()
                ->where('session_id', $sessionId)
                ->where('client_id', $clientId)
                ->get()
                ->all(),
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function revokeClient(string $clientId): array
    {
        return $this->revokeRecords(
            $this->activeRecords()->where('client_id', $clientId)->get()->all(),
        );
    }

    public function pruneExpiredAndRevoked(?CarbonImmutable $now = null): int
    {
        $cutoff = ($now ?? CarbonImmutable::now())->toDateTimeString();

        return DB::table('refresh_token_rotations')
            ->where(function (Builder $query) use ($cutoff): void {
                $query->where('expires_at', '<=', $cutoff)
                    ->orWhereNotNull('revoked_at');
            })
            ->delete();
    }

    private function encrypt(?string $value): ?string
    {
        return $value === null ? null : $this->encryptor->encrypt($value);
    }

    /**
     * Decrypt upstream refresh tokens with transparent legacy migration.
     *
     * Tokens encrypted before the UpstreamTokenEncryptor was introduced
     * used Laravel's Crypt facade (APP_KEY). We detect the legacy format
     * and fall back to Crypt::decryptString so existing sessions survive
     * the migration. New encryptions always use the dedicated key.
     */
    private function decrypt(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if ($this->encryptor->isLegacyFormat($value)) {
            return Crypt::decryptString($value);
        }

        return $this->encryptor->decrypt($value);
    }

    private function plainToken(string $tokenId, string $secret): string
    {
        return sprintf('rt_%s.%s', $tokenId, $secret);
    }

    /**
     * @return array{0: string|null, 1: string|null}
     */
    private function parse(string $plainToken): array
    {
        if (! str_starts_with($plainToken, 'rt_')) {
            return [null, null];
        }

        $parts = explode('.', substr($plainToken, 3), 2);

        return count($parts) === 2 ? [$parts[0], $parts[1]] : [null, null];
    }

    private function validRecord(?object $record, string $secret): bool
    {
        return $record !== null
            && $record->revoked_at === null
            && CarbonImmutable::parse((string) $record->expires_at)->isFuture()
            && hash_equals((string) $record->secret_hash, hash('sha256', $secret));
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(object $record): array
    {
        return [
            'subject_id' => $record->subject_id,
            'client_id' => $record->client_id,
            'refresh_token_id' => $record->refresh_token_id,
            'token_family_id' => $record->token_family_id,
            'family_created_at' => $this->authTime(
                $record->family_created_at ?? $record->created_at ?? null,
            ),
            'scope' => $record->scope,
            'session_id' => $record->session_id,
            'auth_time' => $this->authTime($record->auth_time),
            'amr' => $this->decodeAmr($record->amr),
            'acr' => is_string($record->acr) ? $record->acr : null,
            'upstream_refresh_token' => $this->decrypt($record->upstream_refresh_token),
            'expires_at' => $record->expires_at,
        ];
    }

    /**
     * @param  list<string>  $amr
     */
    private function encodeAmr(array $amr): ?string
    {
        return $amr === [] ? null : json_encode($amr, JSON_THROW_ON_ERROR);
    }

    /**
     * @return list<string>
     */
    private function decodeAmr(mixed $amr): array
    {
        if (! is_string($amr) || $amr === '') {
            return [];
        }

        $decoded = json_decode($amr, true, 512, JSON_THROW_ON_ERROR);

        return array_values(array_filter(is_array($decoded) ? $decoded : [], 'is_string'));
    }

    private function authTime(mixed $value): ?int
    {
        return $value === null ? null : CarbonImmutable::parse((string) $value)->timestamp;
    }

    private function familyCreatedAt(?int $timestamp): CarbonImmutable
    {
        return CarbonImmutable::createFromTimestamp($timestamp ?? now()->timestamp);
    }

    private function familyExpired(object $record): bool
    {
        $createdAt = $this->authTime($record->family_created_at ?? $record->created_at ?? null);

        if ($createdAt === null) {
            return false;
        }

        return CarbonImmutable::createFromTimestamp($createdAt)
            ->addDays((int) config('sso.ttl.refresh_token_family_days', 90))
            ->isPast();
    }

    private function revokeExpiredFamily(string $familyId): void
    {
        DB::table('refresh_token_rotations')
            ->where('token_family_id', $familyId)
            ->whereNull('revoked_at')
            ->update([
                'revoked_at' => now(),
                'updated_at' => now(),
            ]);

        Log::info('Refresh token family expired — family revoked', [
            'token_family_id' => $familyId,
        ]);
    }

    private function activeRecords(): Builder
    {
        return DB::table('refresh_token_rotations')->whereNull('revoked_at');
    }

    /**
     * @param  list<object>  $records
     * @return list<array<string, mixed>>
     */
    private function revokeRecords(array $records): array
    {
        foreach ($records as $record) {
            $this->revoke((string) $record->refresh_token_id);
        }

        return array_map(fn (object $record): array => $this->payload($record), $records);
    }
}
