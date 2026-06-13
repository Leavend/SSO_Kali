<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Correct seeded clients missing allowed scopes by loading them from config.
     * Idempotent: only updates rows where provisioning is 'seeded' and allowed_scopes is null/empty.
     */
    public function up(): void
    {
        if (! Schema::hasTable('oidc_client_registrations')) {
            return;
        }

        $configClients = config('oidc_clients.clients', []);
        if ($configClients === []) {
            return;
        }

        foreach ($configClients as $clientId => $config) {
            if (! is_string($clientId) || ! is_array($config)) {
                continue;
            }

            $scopes = $config['allowed_scopes']
                ?? config('oidc.scopes.default_allowed', ['openid', 'profile', 'email', 'offline_access']);

            DB::table('oidc_client_registrations')
                ->where('client_id', $clientId)
                ->where('provisioning', 'seeded')
                ->where(function (Builder $query): void {
                    $this->whereMissingScopes($query);
                })
                ->update([
                    'allowed_scopes' => $scopes,
                    'updated_at' => now(),
                ]);
        }
    }

    /**
     * Irreversible by design.
     *
     * up() corrects a seed defect (null/empty allowed_scopes) for seeded
     * clients. Reverting to the buggy null state would clobber legitimate
     * admin edits made on the DB-wins registry after up() ran — the
     * migration has no way to distinguish "null because of the original
     * seed bug" from "null because an admin explicitly cleared scopes".
     */
    public function down(): void
    {
        // no-op: the null allowed_scopes was a seed defect; rolling back
        // to that state has no value and would overwrite admin edits.
    }

    private function whereMissingScopes(Builder $query): void
    {
        $query->whereNull('allowed_scopes')
            ->orWhereJsonLength('allowed_scopes', 0);
    }
};
