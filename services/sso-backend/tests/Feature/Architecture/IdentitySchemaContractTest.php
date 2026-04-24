<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schema;

it('creates canonical subject_id columns as non-uuid strings', function (): void {
    expect(Schema::hasColumn('users', 'subject_id'))->toBeTrue()
        ->and(Schema::getColumnType('users', 'subject_id'))->not->toBe('uuid')
        ->and(Schema::hasColumn('login_contexts', 'subject_id'))->toBeTrue()
        ->and(Schema::getColumnType('login_contexts', 'subject_id'))->not->toBe('uuid')
        ->and(Schema::hasColumn('refresh_token_rotations', 'subject_id'))->toBeTrue()
        ->and(Schema::getColumnType('refresh_token_rotations', 'subject_id'))->not->toBe('uuid')
        ->and(Schema::hasColumn('refresh_token_rotations', 'family_created_at'))->toBeTrue();
});
