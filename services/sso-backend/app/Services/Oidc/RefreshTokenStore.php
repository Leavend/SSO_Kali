<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Exceptions\RefreshTokenRotationConflict;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class RefreshTokenStore
{
    public function __construct(
        private readonly RefreshTokenIssuePayloadFactory $issuePayloads,
        private readonly RefreshTokenPayloadMapper $payloads,
    ) {}

    /** @return array{id: string, token: string} */
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
        ?string $tokenId = null,
    ): array {
        $resolvedTokenId = $tokenId ?? (string) Str::uuid();
        $secret = bin2hex(random_bytes(32));
        $tokenFamilyId = $familyId ?? (string) Str::uuid();

        DB::table('refresh_token_rotations')->insert($this->issuePayloads->make(
            $subjectId,
            $clientId,
            $scope,
            $sessionId,
            $upstreamRefreshToken,
            $authTime,
            $this->normalizeAmr($amr),
            $acr,
            $resolvedTokenId,
            $tokenFamilyId,
            $secret,
            $familyCreatedAt,
        ));

        return ['id' => $resolvedTokenId, 'token' => $this->plainToken($resolvedTokenId, $secret)];
    }

    /**
     * @param  array<string, mixed>  $record
     * @param  array<string, mixed>  $context
     * @return array{id: string, token: string}
     */
    public function rotateAtomic(array $record, array $context): array
    {
        return DB::transaction(function () use ($record, $context): array {
            $tokenId = (string) $record['refresh_token_id'];
            $this->assertRotationClaimable($tokenId);
            $replacementId = (string) Str::uuid();
            if (! $this->atomicClaim($tokenId, $replacementId)) {
                throw new RefreshTokenRotationConflict($tokenId);
            }

            return $this->issueReplacement($record, $context, $replacementId);
        });
    }

    /** @return array<string, mixed>|null */
    public function findActive(string $plainToken, string $clientId): ?array
    {
        return $this->resolveActive($plainToken, $clientId)['record'];
    }

    /** @return array{record: array<string, mixed>|null, reuse: bool, family_id: string|null, token_id: string|null} */
    public function resolveActive(string $plainToken, string $clientId): array
    {
        [$tokenId, $secret] = $this->parse($plainToken);
        if ($tokenId === null || $secret === null) {
            return (new RefreshTokenReuseSignal(null, false, null, null))->toArray();
        }

        $record = $this->record($tokenId, $clientId);
        if ($record === null) {
            return (new RefreshTokenReuseSignal(null, false, null, $tokenId))->toArray();
        }

        return $this->signalForRecord($record, $secret, $tokenId)->toArray();
    }

    public function atomicClaim(string $tokenId, string $replacementId): bool
    {
        return DB::table('refresh_token_rotations')
            ->where('refresh_token_id', $tokenId)
            ->whereNull('revoked_at')
            ->update(['replaced_by_token_id' => $replacementId, 'revoked_at' => now(), 'updated_at' => now()]) === 1;
    }

    public function revoke(string $tokenId, ?string $replacementId = null): void
    {
        DB::table('refresh_token_rotations')
            ->where('refresh_token_id', $tokenId)
            ->update(['replaced_by_token_id' => $replacementId, 'revoked_at' => now(), 'updated_at' => now()]);
    }

    /** @return list<array<string, mixed>> */
    public function revokeSession(string $sessionId): array
    {
        return $this->revokeRecords($this->activeRecords()->where('session_id', $sessionId)->get()->all());
    }

    /** @return list<array<string, mixed>> */
    public function revokeSubject(string $subjectId): array
    {
        return $this->revokeRecords($this->activeRecords()->where('subject_id', $subjectId)->get()->all());
    }

    /** @return list<array<string, mixed>> */
    public function revokeClientSessionsForSubject(string $subjectId, string $clientId): array
    {
        return $this->revokeRecords($this->activeRecords()->where('subject_id', $subjectId)->where('client_id', $clientId)->get()->all());
    }

    /** @return list<array<string, mixed>> */
    public function revokeClientSession(string $sessionId, string $clientId): array
    {
        return $this->revokeRecords($this->activeRecords()->where('session_id', $sessionId)->where('client_id', $clientId)->get()->all());
    }

    /** @return list<array<string, mixed>> */
    public function revokeClient(string $clientId): array
    {
        return $this->revokeRecords($this->activeRecords()->where('client_id', $clientId)->get()->all());
    }

    public function pruneExpiredAndRevoked(?CarbonImmutable $now = null): int
    {
        $cutoff = ($now ?? CarbonImmutable::now())->toDateTimeString();

        return DB::table('refresh_token_rotations')
            ->where(fn (Builder $query): Builder => $query->where('expires_at', '<=', $cutoff)->orWhereNotNull('revoked_at'))
            ->delete();
    }

    public function subjectIdForFamily(string $familyId): ?string
    {
        $subjectId = DB::table('refresh_token_rotations')
            ->where('token_family_id', $familyId)
            ->orderByDesc('created_at')
            ->value('subject_id');

        return is_string($subjectId) && $subjectId !== '' ? $subjectId : null;
    }

    private function assertRotationClaimable(string $tokenId): void
    {
        $current = DB::table('refresh_token_rotations')->where('refresh_token_id', $tokenId)->lockForUpdate()->first();
        if ($current === null || $current->revoked_at !== null) {
            throw new RefreshTokenRotationConflict($tokenId);
        }
    }

    /** @param array<string, mixed> $record @param array<string, mixed> $context @return array{id: string, token: string} */
    private function issueReplacement(array $record, array $context, string $replacementId): array
    {
        return $this->issue(
            subjectId: (string) $record['subject_id'],
            clientId: (string) $record['client_id'],
            scope: (string) ($context['scope'] ?? $record['scope']),
            sessionId: (string) $record['session_id'],
            upstreamRefreshToken: $this->replacementUpstreamToken($record, $context),
            authTime: $this->replacementAuthTime($record, $context),
            amr: $this->normalizeAmr($context['amr'] ?? $record['amr'] ?? []),
            acr: $this->replacementAcr($record, $context),
            familyId: (string) $record['token_family_id'],
            familyCreatedAt: is_int($record['family_created_at'] ?? null) ? $record['family_created_at'] : null,
            tokenId: $replacementId,
        );
    }

    /** @param array<string, mixed> $record @param array<string, mixed> $context */
    private function replacementUpstreamToken(array $record, array $context): ?string
    {
        return is_string($context['upstream_refresh_token'] ?? null)
            ? $context['upstream_refresh_token']
            : (is_string($record['upstream_refresh_token'] ?? null) ? $record['upstream_refresh_token'] : null);
    }

    /** @param array<string, mixed> $record @param array<string, mixed> $context */
    private function replacementAuthTime(array $record, array $context): int
    {
        return is_int($context['auth_time'] ?? null)
            ? $context['auth_time']
            : (is_int($record['auth_time'] ?? null) ? $record['auth_time'] : now()->timestamp);
    }

    /** @param array<string, mixed> $record @param array<string, mixed> $context */
    private function replacementAcr(array $record, array $context): ?string
    {
        return is_string($context['acr'] ?? null)
            ? $context['acr']
            : (is_string($record['acr'] ?? null) ? $record['acr'] : null);
    }

    private function record(string $tokenId, string $clientId): ?object
    {
        return DB::table('refresh_token_rotations')->where('refresh_token_id', $tokenId)->where('client_id', $clientId)->first();
    }

    private function signalForRecord(object $record, string $secret, string $tokenId): RefreshTokenReuseSignal
    {
        $family = RefreshTokenFamily::fromRecord($record);
        if ($this->isReuse($record, $secret)) {
            $this->revokeFamily($family->id);

            return new RefreshTokenReuseSignal(null, true, $family->id, $tokenId);
        }
        if ($family->isExpired()) {
            $this->revokeExpiredFamily($family->id);

            return new RefreshTokenReuseSignal(null, false, $family->id, $tokenId);
        }

        return new RefreshTokenReuseSignal($this->validRecord($record, $secret) ? $this->payloads->map($record) : null, false, $family->id, $tokenId);
    }

    private function isReuse(object $record, string $secret): bool
    {
        return hash_equals((string) $record->secret_hash, hash('sha256', $secret))
            && $record->revoked_at !== null
            && $record->replaced_by_token_id !== null;
    }

    private function revokeFamily(string $familyId): void
    {
        $this->revokeFamilyWithMessage($familyId, 'warning', 'Refresh token reuse detected — family revoked');
    }

    private function revokeExpiredFamily(string $familyId): void
    {
        $this->revokeFamilyWithMessage($familyId, 'info', 'Refresh token family expired — family revoked');
    }

    private function revokeFamilyWithMessage(string $familyId, string $level, string $message): void
    {
        DB::table('refresh_token_rotations')->where('token_family_id', $familyId)->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
        Log::log($level, $message, ['token_family_id' => $familyId]);
    }

    /** @return array{0: string|null, 1: string|null} */
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

    /** @return list<string> */
    private function normalizeAmr(mixed $value): array
    {
        return is_array($value)
            ? array_values(array_filter($value, static fn (mixed $entry): bool => is_string($entry) && $entry !== ''))
            : [];
    }

    private function plainToken(string $tokenId, string $secret): string
    {
        return sprintf('rt_%s.%s', $tokenId, $secret);
    }

    private function activeRecords(): Builder
    {
        return DB::table('refresh_token_rotations')->whereNull('revoked_at');
    }

    /** @param list<object> $records @return list<array<string, mixed>> */
    private function revokeRecords(array $records): array
    {
        foreach ($records as $record) {
            $this->revoke((string) $record->refresh_token_id);
        }

        return array_map(fn (object $record): array => $this->payloads->map($record), $records);
    }
}
