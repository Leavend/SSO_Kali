<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;

it('down() is irreversible and preserves all scopes (configured + admin overrides)', function (): void {
    // 1. Prepare: Clear the table and insert seeded client rows with NULL allowed_scopes.
    DB::table('oidc_client_registrations')->truncate();

    $now = now();
    $configClients = config('oidc_clients.clients', []);
    expect($configClients)->not->toBeEmpty();

    foreach ($configClients as $clientId => $config) {
        DB::table('oidc_client_registrations')->insert([
            'client_id' => $clientId,
            'display_name' => $clientId,
            'type' => $config['type'] ?? 'public',
            'environment' => 'production',
            'app_base_url' => 'http://localhost',
            'redirect_uris' => json_encode(['http://localhost/callback']),
            'post_logout_redirect_uris' => json_encode([]),
            'owner_email' => 'admin@example.com',
            'provisioning' => 'seeded',
            'contract' => json_encode(['source' => 'config/seeder']),
            'status' => 'active',
            'allowed_scopes' => null, // Initially null
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    // 2. Run the up() migration manually.
    $migration = require database_path('migrations/2026_06_12_010000_correct_seeded_client_allowed_scopes.php');
    $migration->up();

    // 3. Assert: Verify each seeded client allowed_scopes matches configuration.
    foreach ($configClients as $clientId => $config) {
        $row = DB::table('oidc_client_registrations')->where('client_id', $clientId)->first();
        expect($row)->not->toBeNull();

        $expectedScopes = $config['allowed_scopes']
            ?? config('oidc.scopes.default_allowed', ['openid', 'profile', 'email', 'offline_access']);

        expect(normalizeScopes($row->allowed_scopes))->toBe($expectedScopes);
    }

    // 4. Simulate an administrative override on one client (scope custom).
    $firstClientId = array_key_first($configClients);
    DB::table('oidc_client_registrations')
        ->where('client_id', $firstClientId)
        ->update(['allowed_scopes' => json_encode(['openid', 'profile', 'custom'])]);

    // 5. Run the down() migration (no-op by design — irreversible).
    $migration->down();

    // 6. Assert: down() is a no-op; all rows preserve their pre-rollback state.
    foreach ($configClients as $clientId => $config) {
        $row = DB::table('oidc_client_registrations')->where('client_id', $clientId)->first();
        expect($row)->not->toBeNull();
        expect($row->allowed_scopes)->not->toBeNull(
            'No seeded client should have null allowed_scopes after down().',
        );

        if ($clientId === $firstClientId) {
            // Admin override survived rollback — unchanged.
            expect(normalizeScopes($row->allowed_scopes))->toBe(['openid', 'profile', 'custom']);
        } else {
            // Scopes that up() wrote from config are preserved — down() did nothing.
            $expectedScopes = $config['allowed_scopes']
                ?? config('oidc.scopes.default_allowed', ['openid', 'profile', 'email', 'offline_access']);
            expect(normalizeScopes($row->allowed_scopes))->toBe($expectedScopes);
        }
    }
});

/**
 * @return array<int, string>|null
 */
function normalizeScopes(mixed $value): ?array
{
    if (is_array($value)) {
        return array_values(array_map(static fn (mixed $scope): string => (string) $scope, $value));
    }

    if (! is_string($value) || $value === '') {
        return null;
    }

    $decoded = json_decode($value, true);

    if (! is_array($decoded)) {
        return null;
    }

    return array_values(array_map(static fn (mixed $scope): string => (string) $scope, $decoded));
}
