<?php

declare(strict_types=1);

namespace App\Models\Passport;

use Illuminate\Contracts\Auth\Authenticatable;
use Laravel\Passport\Client as PassportClient;
use Laravel\Passport\Scope;

final class Client extends PassportClient
{
    /**
     * @param  Scope[]  $scopes
     */
    public function skipsAuthorization(Authenticatable $user, array $scopes): bool
    {
        return $this->getKey() === config('sso.admin.panel_client_id', 'sso-admin-panel');
    }
}
