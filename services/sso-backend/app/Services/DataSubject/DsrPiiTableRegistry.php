<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

final class DsrPiiTableRegistry
{
    /**
     * @return list<string>
     */
    public function configuredTables(): array
    {
        $tables = config('dsr.pii_tables', []);
        if (! is_array($tables)) {
            return [];
        }

        return array_values(array_filter($tables, 'is_string'));
    }

    /**
     * @return list<string>
     */
    public function coveredTables(): array
    {
        return [
            'users',
            'external_subject_links',
            'mfa_credentials',
            'mfa_recovery_codes',
            'user_consents',
            'sso_sessions',
            'oidc_rp_sessions',
            'oauth_access_tokens',
            'oauth_refresh_tokens',
            'refresh_token_rotations',
            'password_reset_tokens',
        ];
    }
}
