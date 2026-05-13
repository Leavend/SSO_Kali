<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\UserConsent;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * FR-011: Consent lifecycle service.
 *
 * Manages user consent grants — checking, granting, revoking,
 * and listing active consents for the connected apps view.
 */
final class ConsentService
{
    /**
     * Check if the user has an active consent covering all requested scopes.
     *
     * @param  list<string>  $scopes
     */
    public function hasConsent(string $subjectId, string $clientId, array $scopes): bool
    {
        $consent = $this->activeConsent($subjectId, $clientId);

        return $consent !== null && $consent->coversScopes($scopes);
    }

    /**
     * Grant (or update) consent for a user+client pair.
     *
     * @param  list<string>  $scopes
     */
    public function grant(string $subjectId, string $clientId, array $scopes): UserConsent
    {
        return UserConsent::query()->updateOrCreate(
            ['subject_id' => $subjectId, 'client_id' => $clientId],
            [
                'scopes' => array_values(array_unique($scopes)),
                'granted_at' => Carbon::now(),
                'revoked_at' => null,
            ],
        );
    }

    /**
     * Revoke consent for a user+client pair.
     */
    public function revoke(string $subjectId, string $clientId): bool
    {
        return UserConsent::query()
            ->active()
            ->forSubject($subjectId)
            ->forClient($clientId)
            ->update(['revoked_at' => Carbon::now()]) > 0;
    }

    /**
     * List all active consents for a user (for connected apps view).
     *
     * @return Collection<int, UserConsent>
     */
    public function listForSubject(string $subjectId): Collection
    {
        return UserConsent::query()
            ->active()
            ->forSubject($subjectId)
            ->orderBy('granted_at', 'desc')
            ->get();
    }

    private function activeConsent(string $subjectId, string $clientId): ?UserConsent
    {
        return UserConsent::query()
            ->active()
            ->forSubject($subjectId)
            ->forClient($clientId)
            ->first();
    }
}
