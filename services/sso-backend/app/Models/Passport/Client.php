<?php

declare(strict_types=1);

namespace App\Models\Passport;

use Illuminate\Contracts\Auth\Authenticatable;
use Laravel\Passport\Client as PassportClient;
use Laravel\Passport\Scope;

final class Client extends PassportClient
{
    /**
     * FR-005/FR-006: Passport::$clientUuids=false in AppServiceProvider. IDs
     * are string slugs from config/oidc_clients.php (sso-frontend-portal,
     * app-a, ...). Eloquent defaults to incrementing int keys, so we must
     * override both to preserve the string ID on save().
     */
    protected $keyType = 'string';

    public $incrementing = false;

    /**
     * Legacy: the sso-admin-panel client skips the consent prompt since it is
     * first-party. Admin UI will move to a separate sso-frontend-admin
     * service; this special case is kept until that migration lands.
     *
     * @param  Scope[]  $scopes
     */
    public function skipsAuthorization(Authenticatable $user, array $scopes): bool
    {
        return $this->getKey() === config('sso.admin.panel_client_id', 'sso-admin-panel');
    }
}


