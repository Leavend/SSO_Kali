<?php

declare(strict_types=1);

use App\Support\Profile\NameComposer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')
            ->select(['id', 'display_name', 'given_name', 'family_name'])
            ->orderBy('id')
            ->chunkById(100, function ($users): void {
                foreach ($users as $user) {
                    $givenName = is_string($user->given_name) ? trim($user->given_name) : null;
                    $familyName = is_string($user->family_name) ? trim($user->family_name) : null;

                    if (! $this->shouldBackfill($givenName, $familyName)) {
                        continue;
                    }

                    $names = NameComposer::derive(is_string($user->display_name) ? $user->display_name : null);
                    $displayName = NameComposer::compose($names['given_name'], $names['family_name']);

                    DB::table('users')
                        ->where('id', $user->id)
                        ->update([
                            'given_name' => $names['given_name'],
                            'family_name' => $names['family_name'],
                            'display_name' => $displayName !== '' ? $displayName : $user->display_name,
                            'updated_at' => now(),
                        ]);
                }
            });
    }

    public function down(): void
    {
        // Data-quality backfill is intentionally irreversible.
    }

    private function shouldBackfill(?string $givenName, ?string $familyName): bool
    {
        return $givenName === null
            || $givenName === ''
            || $familyName === null
            || $familyName === ''
            || NameComposer::hasMultipleWords($givenName)
            || NameComposer::hasMultipleWords($familyName);
    }
};
