<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Actions\Admin\ExportAdminAuditEventsAction;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Shared derivation for support-reference (REF) codes.
 *
 * Mirrors formatSupportReference() in the frontend (display-identifiers.ts).
 * Both strip non-alphanumeric, uppercase, take last 8 characters → `REF-XXXXXXXX`.
 *
 * IF THIS CHANGES, UPDATE BOTH SIDES.
 *
 * @see AdminAuditLogger (writing REF to audit events)
 * @see AdminAuditTrailQuery (filtering by REF with suffix fallback)
 * @see AdminAuthenticationAuditQuery (filtering auth events by REF)
 * @see ExportAdminAuditEventsAction (filtering export by REF with suffix fallback)
 */
final class SupportReference
{
    /**
     * Derive a REF code from a request ID.
     * Returns null when the input is empty or yields no alphanumeric characters.
     */
    public static function fromRequestId(?string $requestId): ?string
    {
        if (! is_string($requestId) || $requestId === '') {
            return null;
        }

        $cleaned = preg_replace('/[^a-zA-Z0-9]/', '', $requestId);

        if (! is_string($cleaned) || $cleaned === '') {
            return null;
        }

        return 'REF-'.strtoupper(substr($cleaned, -8));
    }

    /**
     * Extract the normalized 8-character suffix from a REF or request ID.
     * Strips non-alphanumeric, uppercases, takes last 8 characters.
     * Returns empty string when the input yields no characters.
     */
    public static function suffixOf(?string $ref): string
    {
        $normalized = preg_replace('/[^a-z0-9]/iu', '', $ref ?? '') ?? '';
        $normalized = strtoupper($normalized);

        if ($normalized === '') {
            return '';
        }

        return mb_substr($normalized, -8);
    }

    /**
     * Build a WHERE closure that matches exact support_reference OR suffix of request_id.
     *
     * Portability: uses the ->> operator for JSON text extraction
     * (valid in PostgreSQL and SQLite), preventing grammar errors
     * from raw ->identifier::text expressions.
     *
     * DB-side normalization strips non-alphanumeric characters before
     * the LIKE comparison, making hyphenated request_ids match their
     * REF-derived suffix (e.g. test-req-999 → REF-STREQ999).
     *
     * Use in both list and export queries to prevent drift.
     *
     * @return Closure(Builder): void
     */
    public static function whereSuffixOrExact(string $supportRef): Closure
    {
        return function (Builder $query) use ($supportRef): void {
            $suffix = self::suffixOf($supportRef);
            $query->where('context->support_reference', $supportRef);
            if ($suffix !== '') {
                $expr = self::normalizedColumnExpr("context->>'request_id'");
                $query->orWhereRaw("{$expr} LIKE ?", ['%'.$suffix]);
            }
        };
    }

    /**
     * Build a driver-aware SQL expression that strips non-alphanumeric
     * characters and uppercases a column/expression for suffix matching.
     *
     * PostgreSQL uses REGEXP_REPLACE for full portability.
     * SQLite falls back to nested REPLACE calls for common separators (-, _, :, space).
     *
     * @param  string  $expr  Raw column or JSON expression (e.g. 'request_id', "context->>'request_id'")
     * @return string SQL expression fragment (NOT including LIKE or binding)
     */
    public static function normalizedColumnExpr(string $expr): string
    {
        $driver = DB::connection()->getDriverName();

        if ($driver === 'pgsql') {
            return "UPPER(REGEXP_REPLACE({$expr}, '[^A-Za-z0-9]', '', 'g'))";
        }

        // SQLite fallback: chain REPLACE to strip common separators
        return "UPPER(REPLACE(REPLACE(REPLACE(REPLACE({$expr}, '-', ''), '_', ''), ':', ''), ' ', ''))";
    }
}
