<?php

declare(strict_types=1);

namespace App\Support\Identity;

/**
 * Canonical set of role slugs that qualify a user as "staff" for entitlement
 * gating.
 *
 * Single source of truth shared by EntitlementGuard (runtime staff-app access)
 * and the entitlement backfill migration (grandfather grants) so the two can
 * never silently drift: adding a staffing role here updates both the guard and
 * any fresh-install backfill in one place.
 */
final class StaffingRoles
{
    /** @var list<string> */
    public const array SLUGS = ['pegawai', 'admin'];

    /**
     * @param  iterable<mixed>  $roleSlugs
     */
    public static function matchedBy(iterable $roleSlugs): bool
    {
        foreach ($roleSlugs as $slug) {
            if (in_array($slug, self::SLUGS, true)) {
                return true;
            }
        }

        return false;
    }
}
