<?php

declare(strict_types=1);

namespace App\Support\Performance;

use App\Support\Cache\AtomicCounterStore;

final class CpuMetricsRegistry
{
    private const PREFIX = 'perf:cpu:';
    private const JWT_SIGN = 'jwt_sign';
    private const JWT_DECODE = 'jwt_decode';
    private const KEY_MATERIAL_FETCH = 'key_material_fetch';
    private const KEY_DETAILS_FETCH = 'key_details_fetch';
    private const CACHE_GET = 'cache_get';
    private const CACHE_PUT = 'cache_put';
    private const CACHE_INCR = 'cache_incr';
    private const HTTP_OUTBOUND = 'http_outbound';
    private const DB_QUERY = 'db_query';
    private const TOTAL_OPERATIONS = 'total_operations';

    public function __construct(
        private readonly AtomicCounterStore $counter,
        private readonly bool $enabled = true,
    ) {}

    public function record(CpuMetric $metric): void
    {
        if (! $this->enabled) {
            return;
        }

        $this->increment(self::TOTAL_OPERATIONS);
        $this->increment($metric->value);
    }

    public function recordJwtSign(float $durationMs = 0): void
    {
        $this->record(new CpuMetric(self::JWT_SIGN, $durationMs));
    }

    public function recordJwtDecode(float $durationMs = 0): void
    {
        $this->record(new CpuMetric(self::JWT_DECODE, $durationMs));
    }

    public function recordKeyMaterialFetch(float $durationMs = 0): void
    {
        $this->record(new CpuMetric(self::KEY_MATERIAL_FETCH, $durationMs));
    }

    public function recordKeyDetailsFetch(float $durationMs = 0): void
    {
        $this->record(new CpuMetric(self::KEY_DETAILS_FETCH, $durationMs));
    }

    public function recordCacheGet(string $key, bool $hit = false): void
    {
        if (! $this->enabled) {
            return;
        }

        $this->increment($hit ? 'cache_hit' : 'cache_miss');
        $this->increment(self::CACHE_GET);
    }

    public function recordCachePut(string $key): void
    {
        $this->increment(self::CACHE_PUT);
    }

    public function recordCacheIncrement(string $key): void
    {
        $this->increment(self::CACHE_INCR);
    }

    public function recordHttpOutbound(int $statusCode, float $durationMs = 0): void
    {
        if (! $this->enabled) {
            return;
        }

        $this->increment(self::HTTP_OUTBOUND);
        $this->increment('http_code_'.$statusCode);
    }

    public function recordDbQuery(float $durationMs = 0): void
    {
        $this->increment(self::DB_QUERY);
    }

    /**
     * @return array<string, mixed>
     */
    public function getMetricsSnapshot(): array
    {
        $jwtSign = $this->get(self::JWT_SIGN);
        $jwtDecode = $this->get(self::JWT_DECODE);

        return [
            'jwt_operations' => [
                'sign' => $jwtSign,
                'decode' => $jwtDecode,
                'total' => $jwtSign + $jwtDecode,
            ],
            'key_material' => [
                'fetch_count' => $this->get(self::KEY_MATERIAL_FETCH),
                'details_count' => $this->get(self::KEY_DETAILS_FETCH),
            ],
            'cache_operations' => [
                'get' => $this->get(self::CACHE_GET),
                'put' => $this->get(self::CACHE_PUT),
                'increment' => $this->get(self::CACHE_INCR),
                'hit_ratio' => $this->calculateCacheHitRatio(),
            ],
            'external_calls' => [
                'http_total' => $this->get(self::HTTP_OUTBOUND),
                'db_queries' => $this->get(self::DB_QUERY),
            ],
            'totals' => [
                'operations' => $this->get(self::TOTAL_OPERATIONS),
            ],
        ];
    }

    public function reset(): void
    {
        foreach ([
            self::TOTAL_OPERATIONS,
            self::JWT_SIGN,
            self::JWT_DECODE,
            self::KEY_MATERIAL_FETCH,
            self::KEY_DETAILS_FETCH,
            self::CACHE_GET,
            self::CACHE_PUT,
            self::CACHE_INCR,
            self::HTTP_OUTBOUND,
            self::DB_QUERY,
            'cache_hit',
            'cache_miss',
        ] as $name) {
            $this->counter->reset(self::PREFIX.$name);
        }
    }

    private function increment(string $name, int $amount = 1): void
    {
        if ($this->enabled) {
            $this->counter->increment(self::PREFIX.$name, $amount);
        }
    }

    private function get(string $name): int
    {
        return $this->counter->get(self::PREFIX.$name, 0);
    }

    private function calculateCacheHitRatio(): float
    {
        $hits = $this->get('cache_hit');
        $misses = $this->get('cache_miss');
        $total = $hits + $misses;

        return $total === 0 ? 0.0 : $hits / $total;
    }
}

readonly class CpuMetric
{
    public function __construct(
        public string $value,
        public ?float $durationMs = null,
    ) {}
}
