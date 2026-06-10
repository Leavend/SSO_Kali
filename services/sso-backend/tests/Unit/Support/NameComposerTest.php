<?php

declare(strict_types=1);

use App\Support\Profile\NameComposer;

it('composes display names from one given-name word and one family-name word', function (): void {
    expect(NameComposer::compose('Tio Hady', 'Pranoto Family'))->toBe('Tio Pranoto')
        ->and(NameComposer::compose('Tio', null))->toBe('Tio')
        ->and(NameComposer::compose(null, 'Pranoto'))->toBe('Pranoto')
        ->and(NameComposer::compose('   ', '   '))->toBe('');
});

it('derives profile name columns from display names', function (): void {
    expect(NameComposer::derive('Tio Hady Pranoto'))->toBe([
        'given_name' => 'Tio',
        'family_name' => 'Pranoto',
    ])->and(NameComposer::derive('Tio'))->toBe([
        'given_name' => 'Tio',
        'family_name' => null,
    ])->and(NameComposer::derive('   '))->toBe([
        'given_name' => null,
        'family_name' => null,
    ]);
});
