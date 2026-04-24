<?php

declare(strict_types=1);

namespace App\Services\Identity;

enum IdentifierType: string
{
    case Email = 'email';
    case Nip = 'nip';
    case Nisn = 'nisn';
    case Username = 'username';
}
