<?php

declare(strict_types=1);

use App\Services\DataSubject\DsrPiiTableCoverageGuard;
use App\Services\DataSubject\DsrPiiTableRegistry;

it('keeps configured DSR PII tables covered by delete or anonymize fulfillment', function (): void {
    $registry = app(DsrPiiTableRegistry::class);

    expect($registry->coveredTables())->toEqualCanonicalizing(config('dsr.pii_tables'));
});

it('fails closed when DSR PII table registry gains an uncovered table', function (): void {
    config()->set('dsr.pii_tables', [
        ...app(DsrPiiTableRegistry::class)->configuredTables(),
        'new_sensitive_table',
    ]);

    app(DsrPiiTableCoverageGuard::class)->assertCovered();
})->throws(RuntimeException::class, 'DSR PII table coverage is incomplete.');
