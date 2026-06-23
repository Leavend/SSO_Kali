<?php

declare(strict_types=1);

namespace App\Support\Oidc;

enum ClientCategory: string
{
    case Public = 'publik';
    case Staffing = 'kepegawaian';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(
            static fn (self $category): string => $category->value,
            self::cases(),
        );
    }
}
