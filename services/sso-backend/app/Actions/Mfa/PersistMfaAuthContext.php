<?php

declare(strict_types=1);

namespace App\Actions\Mfa;

use Illuminate\Support\Facades\DB;

/**
 * FR-019 / UC-67: Persist MFA auth context to login_contexts.
 *
 * After successful MFA challenge verification, upserts the login_contexts
 * record with upgraded amr, acr, and auth_time claims.
 *
 * These claims are later read by LocalTokenService when issuing tokens.
 */
final class PersistMfaAuthContext
{
    /**
     * @param  list<string>  $amr
     */
    public function execute(
        string $subjectId,
        string $ipAddress,
        array $amr = ['pwd', 'mfa'],
        string $acr = 'urn:sso:loa:mfa',
    ): void {
        DB::table('login_contexts')->updateOrInsert(
            ['subject_id' => $subjectId],
            [
                'amr' => json_encode($amr),
                'acr' => $acr,
                'auth_time' => now(),
                'ip_address' => $ipAddress,
                'updated_at' => now(),
            ],
        );
    }
}
