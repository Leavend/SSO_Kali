<?php

declare(strict_types=1);

use App\Exceptions\IpAccessDeniedException;
use App\Models\IpAccessRule;
use App\Services\Security\IpAccessRuleEnforcer;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->enforcer = app(IpAccessRuleEnforcer::class);
});

it('permits access when no rules exist', function (): void {
    $this->enforcer->enforce('192.168.1.1');

    // No exception = pass
    expect(true)->toBeTrue();
});

it('blocks ip matching a block rule', function (): void {
    IpAccessRule::create(['cidr' => '203.0.113.0/24', 'mode' => 'block', 'reason' => 'Block test range']);

    $this->expectException(IpAccessDeniedException::class);
    $this->enforcer->enforce('203.0.113.42');
});

it('permits ip not matching any block rule', function (): void {
    IpAccessRule::create(['cidr' => '203.0.113.0/24', 'mode' => 'block', 'reason' => 'Block test range']);

    $this->enforcer->enforce('10.0.0.1');

    expect(true)->toBeTrue();
});

it('permits ip matching an allow rule even if no block rule applies', function (): void {
    IpAccessRule::create(['cidr' => '10.0.0.0/8', 'mode' => 'allow', 'reason' => 'Allow internal']);

    $this->enforcer->enforce('10.1.2.3');

    expect(true)->toBeTrue();
});

it('blocks ip matching block rule even if allow rule also matches', function (): void {
    IpAccessRule::create(['cidr' => '0.0.0.0/0', 'mode' => 'allow', 'reason' => 'Allow all']);
    IpAccessRule::create(['cidr' => '203.0.113.0/24', 'mode' => 'block', 'reason' => 'Block specific']);

    $this->expectException(IpAccessDeniedException::class);
    $this->enforcer->enforce('203.0.113.42');
});

it('ignores expired block rules', function (): void {
    IpAccessRule::create([
        'cidr' => '203.0.113.0/24',
        'mode' => 'block',
        'reason' => 'Old block',
        'expires_at' => now()->subDay(),
    ]);

    $this->enforcer->enforce('203.0.113.42');

    expect(true)->toBeTrue();
});

it('enforces non-expired block rules', function (): void {
    IpAccessRule::create([
        'cidr' => '203.0.113.0/24',
        'mode' => 'block',
        'reason' => 'Active block',
        'expires_at' => now()->addDay(),
    ]);

    $this->expectException(IpAccessDeniedException::class);
    $this->enforcer->enforce('203.0.113.42');
});
