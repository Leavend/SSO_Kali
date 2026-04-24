<?php

declare(strict_types=1);

namespace Tests\Support;

use Psr\Log\AbstractLogger;

final class ArrayLogger extends AbstractLogger
{
    /**
     * @var list<array{level: string, message: string, context: array<string, mixed>}>
     */
    public array $warnings = [];

    /**
     * @param  array<string, mixed>  $context
     */
    public function log($level, string|\Stringable $message, array $context = []): void
    {
        if ($level !== 'warning') {
            return;
        }

        $this->warnings[] = [
            'level' => 'warning',
            'message' => (string) $message,
            'context' => $context,
        ];
    }
}
