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

        $apps = $this->mergedApps($subjectId);
        $total = count($apps);
        $apps = array_slice($apps, ($page - 1) * $perPage, $perPage);

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

        usort($items, static fn (array $a, array $b): int => strcmp((string) $a['client_id'], (string) $b['client_id']));

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'has_more' => ($page * $perPage) < $total,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function mergedApps(string $subjectId): array
    {
        $apps = [];

        DB::table('refresh_token_rotations')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->select([
                'client_id',
                DB::raw('MIN(created_at) as first_connected_at'),
                DB::raw('MAX(updated_at) as last_used_at'),
                DB::raw('MAX(expires_at) as expires_at'),
                DB::raw('COUNT(*) as active_refresh_tokens'),
            ])
            ->groupBy('client_id')
            ->get()
            ->each(function (object $row) use (&$apps): void {
                $apps[(string) $row->client_id] = $this->app($row);
            });

        DB::table('oidc_rp_sessions')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->get()
            ->each(function (object $row) use (&$apps): void {
                $clientId = (string) $row->client_id;
                $apps[$clientId] ??= [
                    'client_id' => $clientId,
                    'display_name' => $this->displayName($clientId),
                    'first_connected_at' => $this->iso($row->created_at),
                    'last_used_at' => $this->iso($row->last_seen_at),
                    'expires_at' => $this->iso($row->expires_at),
                    'active_refresh_tokens' => 0,
                ];
                $apps[$clientId]['active_rp_sessions'] = (int) (($apps[$clientId]['active_rp_sessions'] ?? 0) + 1);
            });

        UserConsent::query()
            ->active()
            ->forSubject($subjectId)
            ->get()
            ->each(function (UserConsent $consent) use (&$apps): void {
                $apps[$consent->client_id] ??= [
                    'client_id' => $consent->client_id,
                    'display_name' => $this->displayName($consent->client_id),
                    'first_connected_at' => $consent->granted_at->toIso8601String(),
                    'last_used_at' => $consent->granted_at->toIso8601String(),
                    'expires_at' => null,
                    'active_refresh_tokens' => 0,
                    'active_rp_sessions' => 0,
                ];
            });

        return array_values($apps);
    }

    /**
     * @return array<string, mixed>
     */
    private function app(object $row): array
    {
        return [
            'client_id' => (string) $row->client_id,
            'display_name' => $this->displayName((string) $row->client_id),
            'first_connected_at' => $this->iso($row->first_connected_at),
            'last_used_at' => $this->iso($row->last_used_at),
            'expires_at' => $this->iso($row->expires_at),
            'active_refresh_tokens' => (int) $row->active_refresh_tokens,
            'active_rp_sessions' => 0,
        ];
    }

    private function iso(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return str_replace(' ', 'T', (string) $value).'Z';
    }

    private function displayName(string $clientId): string
    {
        $configured = config("oidc_clients.clients.{$clientId}.display_name");

        return is_string($configured) && $configured !== '' ? $configured : $clientId;
    }
}
