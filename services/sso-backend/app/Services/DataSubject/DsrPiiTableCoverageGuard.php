<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use RuntimeException;

final class DsrPiiTableCoverageGuard
{
    public function __construct(private readonly DsrPiiTableRegistry $registry) {}

    public function assertCovered(): void
    {
        $missing = array_diff(
            $this->registry->configuredTables(),
            $this->registry->coveredTables(),
        );

        if ($missing !== []) {
            throw new RuntimeException('DSR PII table coverage is incomplete.');
        }
    }
}
