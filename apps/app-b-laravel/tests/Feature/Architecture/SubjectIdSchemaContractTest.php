<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schema;

it('creates app b canonical subject_id as a non-uuid string', function (): void {
    expect(Schema::hasColumn('users', 'subject_id'))->toBeTrue()
        ->and(Schema::getColumnType('users', 'subject_id'))->not->toBe('uuid')
        ->and(Schema::hasColumn('users', 'external_subject'))->toBeFalse();
});
