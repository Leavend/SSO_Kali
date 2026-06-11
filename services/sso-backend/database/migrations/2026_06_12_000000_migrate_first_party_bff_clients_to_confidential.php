<?php

declare(strict_types=1);

use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('oidc_client_registrations')) {
            return;
        }

        foreach ($this->clients() as $client) {
            $clientId = $client['client_id'];
            $envName = $client['secret_env'];
            $secret = trim($client['secret']);

            if ($secret === '') {
                Log::warning(
                    "Skipping confidential client migration for [{$clientId}]: {$envName} is empty.",
                );

                continue;
            }

            $registration = DB::table('oidc_client_registrations')
                ->where('client_id', $clientId)
                ->first(['type', 'secret_hash']);

            if ($registration === null) {
                Log::warning(
                    "Skipping confidential client migration for [{$clientId}]: registration row was not found.",
                );

                continue;
            }

            $hashes = app(ClientSecretHashPolicy::class);
            $storedHash = is_string($registration->secret_hash) ? $registration->secret_hash : '';

            if ($registration->type === 'confidential' && $this->matches($hashes, $secret, $storedHash)) {
                continue;
            }

            DB::table('oidc_client_registrations')
                ->where('client_id', $clientId)
                ->update([
                    'type' => 'confidential',
                    'secret_hash' => $hashes->make($secret),
                    'secret_rotated_at' => now(),
                    'secret_expires_at' => now()->addDays((int) config('sso.client_secret.ttl_days', 90)),
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('oidc_client_registrations')) {
            return;
        }

        DB::table('oidc_client_registrations')
            ->whereIn('client_id', array_column($this->clients(), 'client_id'))
            ->update([
                'type' => 'public',
                'secret_hash' => null,
                'secret_rotated_at' => null,
                'secret_expires_at' => null,
                'updated_at' => now(),
            ]);
    }

    /**
     * @return list<array{client_id: string, secret: string, secret_env: string}>
     */
    private function clients(): array
    {
        $configured = config('oidc_clients.first_party_bff_clients', []);
        $clients = [];

        foreach (is_array($configured) ? $configured : [] as $client) {
            if (! is_array($client)) {
                continue;
            }

            $clientId = $client['client_id'] ?? null;
            $secretEnv = $client['secret_env'] ?? null;

            if (! is_string($clientId) || $clientId === '' || ! is_string($secretEnv) || $secretEnv === '') {
                continue;
            }

            $clients[] = [
                'client_id' => $clientId,
                'secret' => is_string($client['secret'] ?? null) ? $client['secret'] : '',
                'secret_env' => $secretEnv,
            ];
        }

        return $clients;
    }

    private function matches(ClientSecretHashPolicy $hashes, string $secret, string $storedHash): bool
    {
        if ($storedHash === '') {
            return false;
        }

        try {
            return $hashes->verify($secret, $storedHash);
        } catch (RuntimeException) {
            return false;
        }
    }
};
