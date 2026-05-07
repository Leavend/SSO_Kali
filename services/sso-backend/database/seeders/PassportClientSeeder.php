<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Laravel\Passport\Client;

final class PassportClientSeeder extends Seeder
{
    public function run(): void
    {
        $clientId = (string) config('sso.admin.panel_client_id', 'sso-admin-panel');
        $redirectUri = (string) config('sso.admin.panel_redirect_uri', rtrim((string) config('sso.frontend_url'), '/').'/auth/callback');
        $client = Client::query()->firstOrNew(['id' => $clientId]);

        $client->forceFill([
            'name' => 'SSO Admin Panel',
            'secret' => null,
            'provider' => 'users',
            'redirect_uris' => [$redirectUri],
            'grant_types' => ['authorization_code', 'refresh_token'],
            'revoked' => false,
        ])->save();
    }
}
