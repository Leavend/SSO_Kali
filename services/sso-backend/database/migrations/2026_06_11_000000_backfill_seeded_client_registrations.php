<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Backfill clients defined in config('oidc_clients.clients') into the
     * oidc_client_registrations table so they become the single source of
     * truth (DB-wins). Config entries remain as bootstrap fallback when the
     * table is empty (Schema::hasTable guard in DownstreamClientRegistry).
     *
     * Idempotent: skips any client_id that already has a registration row.
     */
    public function up(): void
    {
        if (! Schema::hasTable('oidc_client_registrations')) {
            return;
        }

        /** @var array<string, array<string, mixed>> $configClients */
        $configClients = config('oidc_clients.clients', []);

        if ($configClients === []) {
            return;
        }

        $ownerEmail = $this->resolveOwnerEmail();

        $existingClientIds = DB::table('oidc_client_registrations')
            ->pluck('client_id')
            ->map(fn ($value) => (string) $value)
            ->toArray();

        $now = now();

        $rows = [];

        foreach ($configClients as $clientId => $config) {
            if (! is_string($clientId) || ! is_array($config)) {
                continue;
            }

            if (in_array($clientId, $existingClientIds, true)) {
                continue;
            }

            $scopes = $config['allowed_scopes']
                ?? config('oidc.scopes.default_allowed', ['openid', 'profile', 'email', 'offline_access']);

            $secretHash = ($config['type'] ?? 'public') === 'confidential'
                && is_string($config['secret'] ?? null)
                ? $config['secret']
                : null;

            $rows[] = [
                'client_id' => $clientId,
                'display_name' => $this->displayName($clientId),
                'type' => (string) ($config['type'] ?? 'public'),
                'environment' => 'production',
                'app_base_url' => $this->appBaseUrl($config),
                'redirect_uris' => json_encode(array_values($config['redirect_uris'] ?? [])),
                'post_logout_redirect_uris' => json_encode(array_values($config['post_logout_redirect_uris'] ?? [])),
                'backchannel_logout_uri' => $config['backchannel_logout_uri'] ?? null,
                'secret_hash' => $secretHash,
                'owner_email' => $ownerEmail,
                'provisioning' => 'seeded',
                'contract' => json_encode([
                    'source' => 'config/seeder',
                    'backfilled_at' => $now->toIso8601String(),
                ]),
                'status' => 'active',
                'activated_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows !== []) {
            // Chunk-safe: all seeded config clients are few, but guard anyway.
            foreach (array_chunk($rows, 50) as $chunk) {
                DB::table('oidc_client_registrations')->insert($chunk);
            }
        }
    }

    public function down(): void
    {
        // No rollback: this migration is data-backfill, not schema. Removing
        // backfilled rows would reintroduce the duality bug.
    }

    /**
     * Resolve the owner email for seeded clients. Priority:
     * 1. config('sso.admin_emails')[0]
     * 2. First admin user from DB (users where role='admin' order by id)
     * 3. Fallback empty string (should not happen in production)
     */
    private function resolveOwnerEmail(): string
    {
        $adminEmails = config('sso.admin_emails', []);

        if (is_array($adminEmails) && $adminEmails !== []) {
            return (string) reset($adminEmails);
        }

        try {
            if (Schema::hasTable('users')) {
                /** @var User|null $admin */
                $admin = User::query()
                    ->where('role', 'admin')
                    ->orderBy('id')
                    ->first();

                if ($admin instanceof User && is_string($admin->email) && $admin->email !== '') {
                    return $admin->email;
                }
            }
        } catch (\Throwable) {
            // Gracefully degrade to empty string when the users table is
            // unavailable (e.g. pristine schema).
        }

        return '';
    }

    private function displayName(string $clientId): string
    {
        return match ($clientId) {
            'sso-frontend-portal' => 'SSO Frontend Portal',
            'sso-admin-panel' => 'SSO Admin Panel',
            'app-a' => 'App A — Public Client',
            'app-b' => 'App B — Confidential Client',
            default => $clientId,
        };
    }

    private function appBaseUrl(array $config): string
    {
        $uris = array_values($config['redirect_uris'] ?? []);

        if ($uris === []) {
            return '';
        }

        $firstUri = (string) $uris[0];
        $parsed = parse_url($firstUri);
        $scheme = $parsed['scheme'] ?? 'https';
        $host = $parsed['host'] ?? '';

        if ($host === '') {
            return '';
        }

        $port = isset($parsed['port']) ? ":{$parsed['port']}" : '';

        return "{$scheme}://{$host}{$port}";
    }
};
