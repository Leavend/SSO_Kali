<?php

declare(strict_types=1);

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

it('creates logout token replay markers with opaque string jti storage', function (): void {
    expect(Schema::hasTable('logout_token_replays'))->toBeTrue()
        ->and(Schema::hasColumns('logout_token_replays', ['jti', 'expires_at']))->toBeTrue()
        ->and(readLogoutTokenReplayMigrationFiles())->toContain("\$table->string('jti')->unique()")
        ->and(readLogoutTokenReplayMigrationFiles())->not->toContain("uuid('jti')")
        ->and(readLogoutTokenReplayMigrationFiles())->not->toContain('uuid("jti")');
});

function readLogoutTokenReplayMigrationFiles(): string
{
    return collect(File::allFiles(database_path('migrations')))
        ->map(fn (SplFileInfo $file): string => File::get($file->getRealPath()))
        ->implode("\n");
}
