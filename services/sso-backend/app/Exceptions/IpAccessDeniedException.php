<?php

declare(strict_types=1);

namespace App\Exceptions;

use Symfony\Component\HttpKernel\Exception\HttpException;

final class IpAccessDeniedException extends HttpException
{
    public function __construct(string $ip, string $reason = 'Request blocked by IP access rule.')
    {
        parent::__construct(403, "Access denied for IP {$ip}: {$reason}");
    }
}
