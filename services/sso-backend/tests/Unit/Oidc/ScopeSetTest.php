<?php

declare(strict_types=1);

use App\Support\Oidc\ScopeSet;

it('parses a space-delimited scope string into an ordered list', function (): void {
    expect(ScopeSet::fromString('openid profile email'))
        ->toBe(['openid', 'profile', 'email']);
});

it('handles a single scope', function (): void {
    expect(ScopeSet::fromString('openid'))
        ->toBe(['openid']);
});

it('trims leading, trailing, and duplicate whitespace', function (): void {
    expect(ScopeSet::fromString('  openid   profile   email  '))
        ->toBe(['openid', 'profile', 'email']);
});

it('returns an empty list for an empty string', function (): void {
    expect(ScopeSet::fromString(''))
        ->toBe([]);
});

it('returns an empty list for whitespace-only input', function (): void {
    expect(ScopeSet::fromString('   '))
        ->toBe([]);
});

it('contains() returns true for a present scope', function (): void {
    $scopes = ScopeSet::fromString('openid profile email');

    expect(ScopeSet::contains($scopes, 'profile'))->toBeTrue();
});

it('contains() returns false for an absent scope', function (): void {
    $scopes = ScopeSet::fromString('openid profile');

    expect(ScopeSet::contains($scopes, 'email'))->toBeFalse();
});

it('contains() uses strict comparison and does not match partial scope names', function (): void {
    $scopes = ScopeSet::fromString('openid profile');

    expect(ScopeSet::contains($scopes, 'open'))->toBeFalse();
});

it('toString() joins scopes with spaces and deduplicates', function (): void {
    expect(ScopeSet::toString(['openid', 'profile', 'openid', 'email']))
        ->toBe('openid profile email');
});
