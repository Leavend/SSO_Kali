<?php

declare(strict_types=1);

use App\Services\Identity\IdentifierResolutionException;
use App\Services\Identity\IdentifierResolver;
use App\Services\Identity\IdentifierType;
use PHPUnit\Framework\Assert;

it('normalizes email identifiers in lowercase', function (): void {
    $resolved = app(IdentifierResolver::class)->parse('  ADMIN@Example.COM ');

    expect($resolved->type)->toBe(IdentifierType::Email)
        ->and($resolved->normalized)->toBe('admin@example.com')
        ->and($resolved->loginHint())->toBe('admin@example.com');
});

it('classifies nisn identifiers while preserving leading zeroes', function (): void {
    $resolved = app(IdentifierResolver::class)->parse(' 0012-3456 78 ');

    expect($resolved->type)->toBe(IdentifierType::Nisn)
        ->and($resolved->normalized)->toBe('0012345678');
});

it('classifies nip identifiers while preserving leading zeroes', function (): void {
    $resolved = app(IdentifierResolver::class)->parse('  19890202 202401 1 001 ');

    expect($resolved->type)->toBe(IdentifierType::Nip)
        ->and($resolved->normalized)->toBe('198902022024011001');
});

it('classifies username identifiers in lowercase', function (): void {
    $resolved = app(IdentifierResolver::class)->parse(' Admin.User-01 ');

    expect($resolved->type)->toBe(IdentifierType::Username)
        ->and($resolved->normalized)->toBe('admin.user-01');
});

it('rejects numeric only usernames to avoid collision with nisn and nip', function (): void {
    expect(fn () => app(IdentifierResolver::class)->parse('123456789'))
        ->toThrow(IdentifierResolutionException::class, 'could not be verified');
});

it('returns a single login hint when the match set is unambiguous', function (): void {
    $hint = app(IdentifierResolver::class)->loginHint('Admin@Example.com', ['principal-admin']);

    expect($hint)->toBe('principal-admin');
});

it('rejects identifiers with no active matches as invalid_credentials', function (): void {
    try {
        app(IdentifierResolver::class)->loginHint('admin@example.com', []);
    } catch (IdentifierResolutionException $exception) {
        expect($exception->error())->toBe('invalid_credentials');

        return;
    }

    Assert::fail('Expected invalid_credentials exception.');
});

it('rejects identifiers with multiple matches as ambiguous_identifier', function (): void {
    try {
        app(IdentifierResolver::class)->loginHint('0012345678', ['principal-a', 'principal-b']);
    } catch (IdentifierResolutionException $exception) {
        expect($exception->error())->toBe('ambiguous_identifier');

        return;
    }

    Assert::fail('Expected ambiguous_identifier exception.');
});

it('keeps invalid_credentials responses generic for malformed and unknown identifiers', function (): void {
    $messages = [];
    $errors = [];

    foreach ([fn () => app(IdentifierResolver::class)->parse('###'), fn () => app(IdentifierResolver::class)->loginHint('admin@example.com', [])] as $attempt) {
        try {
            $attempt();
        } catch (IdentifierResolutionException $exception) {
            $messages[] = $exception->getMessage();
            $errors[] = $exception->error();
        }
    }

    expect($errors)->toBe(['invalid_credentials', 'invalid_credentials'])
        ->and($messages)->toBe([
            'The provided credentials could not be verified.',
            'The provided credentials could not be verified.',
        ])
        ->and($messages[0])->not->toContain('admin@example.com')
        ->and($messages[0])->not->toContain('###');
});

it('fails closed on ambiguous identifiers without leaking candidate login hints', function (): void {
    try {
        app(IdentifierResolver::class)->loginHint('0012345678', ['principal-a', 'principal-b']);
    } catch (IdentifierResolutionException $exception) {
        expect($exception->error())->toBe('ambiguous_identifier')
            ->and($exception->getMessage())->toBe('The identifier matches multiple active identities.')
            ->and($exception->getMessage())->not->toContain('principal-a')
            ->and($exception->getMessage())->not->toContain('principal-b');

        return;
    }

    Assert::fail('Expected ambiguous_identifier exception.');
});
