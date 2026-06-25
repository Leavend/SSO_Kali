<?php

declare(strict_types=1);

use App\Support\Identity\StaffingRoles;

describe('StaffingRoles', function (): void {
    it('recognizes the canonical staffing slugs', function (): void {
        expect(StaffingRoles::matchedBy(['pegawai']))->toBeTrue()
            ->and(StaffingRoles::matchedBy(['admin']))->toBeTrue()
            ->and(StaffingRoles::matchedBy(['user', 'admin']))->toBeTrue();
    });

    it('rejects non-staffing or empty role sets', function (): void {
        expect(StaffingRoles::matchedBy([]))->toBeFalse()
            ->and(StaffingRoles::matchedBy(['user']))->toBeFalse()
            ->and(StaffingRoles::matchedBy(['guru', 'siswa']))->toBeFalse();
    });

    it('exposes the slug set as the single source of truth', function (): void {
        expect(StaffingRoles::SLUGS)->toBe(['pegawai', 'admin']);
    });
});
