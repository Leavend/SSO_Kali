<?php

declare(strict_types=1);

namespace App\Services\Profile;

use App\Models\UserConsent;
use Illuminate\Support\Facades\DB;

final class ConnectedAppsService
{
    /** Default page size for the connected apps listing. */
    public const int DEFAULT_PER_PAGE = 25;

    /** Hard upper bound to keep the listing query bounded (FR-026 / BE-FR026-001). */
    public const int MAX_PER_PAGE = 100;

    /**
     * @return array{items: list<array<string, mixed>>, total: int, page: int, per_page: int, has_more: bool}
     */
    public function listForSubject(string $subjectId, int $page = 1, int $perPage = self::DEFAULT_PER_PAGE): array
    {
        $page = max(1, $page);
        $perPage = max(1, min(self::MAX_PER_PAGE, $perPage));

        $base = DB::table('refresh_token_rotations')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now());

        $total = (int) (clone $base)
            ->distinct()
            ->count('client_id');

        $rows = (clone $base)
            ->select([
                'client_id',
                DB::raw('MIN(created_at) as first_connected_at'),
                DB::raw('MAX(updated_at) as last_used_at'),
                DB::raw('MAX(expires_at) as expires_at'),
                DB::raw('COUNT(*) as active_refresh_tokens'),
            ])
            ->groupBy('client_id')
            ->orderBy('client_id')
            ->limit($perPage)
            ->offset(($page - 1) * $perPage)
            ->get();

        $apps = $rows->map(fn (object $row): array => $this->app($row))->all();

        $clientIds = array_map(static fn (array $app): string => (string) $app['client_id'], $apps);

        // Bound the consent enrichment query to the page we're returning,
        // so removing the listing's hard limit cannot regress the consent
        // join into an unbounded scan.
        $consents = $clientIds === []
            ? collect()
            : UserConsent::query()
                ->active()
                ->forSubject($subjectId)
                ->whereIn('client_id', $clientIds)
                ->get()
                ->keyBy('client_id');

        $items = array_map(function (array $app) use ($consents): array {
            $consent = $consents->get($app['client_id']);
            $app['granted_scopes'] = $consent !== null ? $consent->scopes : [];
            $app['consent_granted_at'] = $consent?->granted_at?->toIso8601String();

            return $app;
        }, $apps);

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'has_more' => ($page * $perPage) < $total,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function app(object $row): array
    {
        return [
            'client_id' => (string) $row->client_id,
            'display_name' => $this->displayName((string) $row->client_id),
            'first_connected_at' => (string) $row->first_connected_at,
            'last_used_at' => (string) $row->last_used_at,
            'expires_at' => (string) $row->expires_at,
            'active_refresh_tokens' => (int) $row->active_refresh_tokens,
        ];
    }

    private function displayName(string $clientId): string
    {
        $configured = config("oidc_clients.clients.{$clientId}.display_name");

        return is_string($configured) && $configured !== '' ? $configured : $clientId;
    }
}
