<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Normalize with the SAME casefold the model boundary uses
        // (User::saving → mb_strtolower(trim(...))). SQL LOWER() is
        // charset/collation-dependent and folds multibyte input differently, so
        // using it here could leave a stored email that never equals the value a
        // runtime login lookup normalizes to — and its duplicate guard could miss
        // a pair the model treats as identical.
        $seen = [];
        $duplicates = [];
        $updates = [];

        DB::table('users')
            ->select(['id', 'email'])
            ->whereNotNull('email')
            ->orderBy('id')
            ->chunkById(500, function ($rows) use (&$seen, &$duplicates, &$updates): void {
                foreach ($rows as $row) {
                    $normalized = mb_strtolower(trim((string) $row->email));

                    if (array_key_exists($normalized, $seen) && $seen[$normalized] !== $row->id) {
                        $duplicates[$normalized] = true;

                        continue;
                    }

                    $seen[$normalized] = $row->id;

                    if ($normalized !== $row->email) {
                        $updates[$row->id] = $normalized;
                    }
                }
            });

        if ($duplicates !== []) {
            throw new RuntimeException('Cannot normalize user emails because case-insensitive duplicates exist: '.implode(', ', array_keys($duplicates)));
        }

        foreach ($updates as $id => $normalized) {
            DB::table('users')->where('id', $id)->update(['email' => $normalized]);
        }
    }

    public function down(): void
    {
        // Email case normalization is intentionally not reversible.
    }
};
