<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Grandfather existing widget consumers onto the new explicit
 * `contract.widget_cors_trusted` gate.
 *
 * Before the gate was introduced, every active dynamic registration's
 * `app_base_url` was unconditionally allow-listed for credentialed cross-origin
 * widget (/widget/*) calls. The gate (WidgetOriginPolicy) is intentionally
 * opt-in, but without a backfill it silently revokes CORS trust from every
 * already-deployed third-party consumer. This migration restores the prior
 * trust set — and only that set — by marking currently-active registrations as
 * trusted. New registrations stay untrusted until an admin opts them in.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('oidc_client_registrations')) {
            return;
        }

        DB::table('oidc_client_registrations')
            ->where('status', 'active')
            ->get()
            ->each(function (object $row): void {
                $contract = $this->decodeContract($row->contract ?? null);

                if (($contract['widget_cors_trusted'] ?? null) === true) {
                    return;
                }

                $contract['widget_cors_trusted'] = true;

                DB::table('oidc_client_registrations')
                    ->where('id', $row->id)
                    ->update([
                        'contract' => json_encode($contract),
                        'updated_at' => now(),
                    ]);
            });
    }

    public function down(): void
    {
        if (! Schema::hasTable('oidc_client_registrations')) {
            return;
        }

        DB::table('oidc_client_registrations')
            ->get()
            ->each(function (object $row): void {
                $contract = $this->decodeContract($row->contract ?? null);

                if (! array_key_exists('widget_cors_trusted', $contract)) {
                    return;
                }

                unset($contract['widget_cors_trusted']);

                DB::table('oidc_client_registrations')
                    ->where('id', $row->id)
                    ->update([
                        // `contract` is NOT NULL; write an empty JSON object rather
                        // than SQL NULL when the flag was the only key, so rollback
                        // does not violate the constraint on PostgreSQL.
                        'contract' => json_encode($contract === [] ? new stdClass : $contract),
                        'updated_at' => now(),
                    ]);
            });
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeContract(mixed $raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }

        if (! is_string($raw) || $raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }
};
