<?php

declare(strict_types=1);

namespace Tests\Feature\Oidc;

use App\Models\Passport\Client;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\Passport;
use Tests\TestCase;

/**
 * FR-005 / FR-006 contract: Passport oauth_clients must accept string IDs
 * that match the config registry (sso-frontend-portal, app-a, etc.), not
 * UUIDs. The system pairs DownstreamClientRegistry (config) with Passport's
 * ClientRepository (DB), and they must use the same ID format.
 */
final class PassportClientStringIdContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_passport_client_uuids_is_disabled(): void
    {
        self::assertFalse(
            Passport::$clientUuids,
            'Passport::$clientUuids must be false so clients can be identified by the string IDs declared in config/oidc_clients.php.',
        );
    }

    public function test_oauth_clients_table_accepts_string_primary_key(): void
    {
        $clientId = 'sso-test-portal-string-id';

        $client = new Client;
        $client->forceFill([
            'id' => $clientId,
            'name' => 'SSO Test Portal',
            'secret' => null,
            'provider' => 'users',
            'redirect_uris' => ['https://example.test/auth/callback'],
            'grant_types' => ['authorization_code', 'refresh_token'],
            'revoked' => false,
        ])->save();

        /** @var Client|null $found */
        $found = Client::query()->find($clientId);

        self::assertNotNull($found, 'Passport must find the client by its string ID.');
        self::assertSame($clientId, $found->getKey());
    }
}
