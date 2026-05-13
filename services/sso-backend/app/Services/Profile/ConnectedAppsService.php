<?php

declare(strict_types=1);

namespace App\Services\Profile;

use App\Models\UserConsent;
use Illuminate\Support\Facades\DB;

final class ConnectedAppsService
{
    /**
     * @return list<array<string, mixed>>
     */
    public function listForSubject(string $subjectId): array
    {
        $apps = DB::table('refresh_token_rotations')
            ->select([
                'client_id',
                DB::raw('MIN(created_at) as first_connected_at'),
                DB::raw('MAX(updated_at) as last_used_at'),
                DB::raw('MAX(expires_at) as expires_at'),
                DB::raw('COUNT(*) as active_refresh_tokens'),
            ])
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->groupBy('client_id')
            ->orderBy('client_id')
            ->get()
            ->map(fn (object $row): array => $this->app($row))
            ->values()
            ->all();

        // FR-011: enrich with granted scopes from consent records
        $consents = UserConsent::query()
            ->active()
            ->forSubject($subjectId)
            ->get()
            ->keyBy('client_id');

        return array_map(function (array $app) use ($consents): array {
            $consent = $consents->get($app['client_id']);
            $app['granted_scopes'] = $consent?->scopes ?? [];
            $app['consent_granted_at'] = $consent?->granted_at?->toIso8601String();

            return $app;
        }, $apps);
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
