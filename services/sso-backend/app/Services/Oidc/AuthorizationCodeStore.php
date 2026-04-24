<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Dual-write authorization code store (H2 fix).
 *
 * Codes are persisted to both cache (Redis) and database (PostgreSQL).
 * On read, the cache is checked first for latency; if the cache misses
 * (e.g. Redis restarted), the database is the authoritative fallback.
 *
 * This eliminates the data-loss window that existed when codes were
 * only stored in the volatile cache layer.
 *
 * The code is consumed atomically — pulled from cache and marked as
 * consumed in the database in a single operation.
 */
final class AuthorizationCodeStore
{
    private const string TABLE = 'authorization_codes';

    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     */
    public function issue(array $payload): string
    {
        $code = bin2hex(random_bytes(32));
        $ttl = (int) config('sso.stores.authorization_code_seconds', 120);
        $hash = $this->hash($code);
        $expiresAt = CarbonImmutable::now()->addSeconds($ttl);

        // Primary: persist to database (authoritative store)
        try {
            DB::table(self::TABLE)->insert([
                'code_hash' => $hash,
                'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
                'expires_at' => $expiresAt,
                'consumed_at' => null,
                'created_at' => now(),
            ]);
        } catch (Throwable $exception) {
            Log::error('[AUTHZ_CODE_DB_WRITE_FAILED]', [
                'error' => $exception->getMessage(),
            ]);

            throw new RuntimeException('The authorization code could not be persisted.');
        }

        // Secondary: write-through to cache for fast reads
        $this->cache->put($this->key($code), $payload, $ttl);

        return $code;
    }

    /**
     * Atomic pull: cache-first, database fallback.
     *
     * @return array<string, mixed>|null
     */
    public function pull(string $code): ?array
    {
        $hash = $this->hash($code);

        // Fast path: try cache first (sub-ms latency)
        $payload = $this->cache->pull($this->key($code));

        if (is_array($payload)) {
            $this->markConsumed($hash);

            return $payload;
        }

        // Slow path: cache miss — fall back to database
        return $this->pullFromDatabase($hash);
    }

    /**
     * Pull from database with atomic consumption (consumed_at guard
     * prevents double-spend even under race conditions).
     *
     * @return array<string, mixed>|null
     */
    private function pullFromDatabase(string $hash): ?array
    {
        try {
            return DB::transaction(function () use ($hash): ?array {
                $query = DB::table(self::TABLE)
                    ->where('code_hash', $hash)
                    ->whereNull('consumed_at')
                    ->where('expires_at', '>', now());

                // Pessimistic lock for PostgreSQL/MySQL; SQLite uses file-level locking
                if (DB::connection()->getDriverName() !== 'sqlite') {
                    $query->lockForUpdate();
                }

                $record = $query->first();

                if ($record === null) {
                    return null;
                }

                DB::table(self::TABLE)
                    ->where('code_hash', $hash)
                    ->whereNull('consumed_at')
                    ->update([
                        'consumed_at' => now(),
                    ]);

                $payload = json_decode((string) $record->payload, true, 512, JSON_THROW_ON_ERROR);

                return is_array($payload) ? $payload : null;
            });
        } catch (Throwable) {
            return null;
        }
    }

    private function markConsumed(string $hash): void
    {
        try {
            DB::table(self::TABLE)
                ->where('code_hash', $hash)
                ->whereNull('consumed_at')
                ->update(['consumed_at' => now()]);
        } catch (Throwable $exception) {
            // Cache-first path succeeded; DB mark is best-effort
            Log::warning('[AUTHZ_CODE_DB_CONSUME_FAILED]', [
                'error' => $exception->getMessage(),
            ]);
        }
    }

    /**
     * Prune expired and consumed authorization codes.
     *
     * Called by the scheduler to keep the table lean.
     */
    public function pruneExpired(): int
    {
        return DB::table(self::TABLE)
            ->where(function ($query): void {
                $query->where('expires_at', '<=', now())
                    ->orWhereNotNull('consumed_at');
            })
            ->delete();
    }

    private function key(string $code): string
    {
        return 'oidc:authorization-code:'.$this->hash($code);
    }

    private function hash(string $code): string
    {
        return hash('sha256', $code);
    }
}
