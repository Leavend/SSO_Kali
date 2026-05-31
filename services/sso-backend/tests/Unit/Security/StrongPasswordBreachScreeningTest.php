<?php

declare(strict_types=1);

use App\Rules\StrongPassword;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

beforeEach(function (): void {
    config()->set('sso.password.breach_check', true);
});

it('rejects a strong password when the HIBP range response contains its hash suffix', function (): void {
    $password = 'Compromised123!';
    [$prefix, $suffix] = passwordHashParts($password);

    Http::fake([
        'https://api.pwnedpasswords.com/range/'.$prefix => Http::response($suffix.':42'.PHP_EOL, 200),
    ]);

    $validator = Validator::make(['password' => $password], [
        'password' => [new StrongPassword],
    ]);

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->first('password'))
        ->toBe('Password ini pernah muncul dalam kebocoran data; pilih yang lain.');
});

it('allows a strong password when the HIBP range response has no matching suffix', function (): void {
    $password = 'FreshStrong123!';
    [$prefix] = passwordHashParts($password);

    Http::fake([
        'https://api.pwnedpasswords.com/range/'.$prefix => Http::response('ABCDEF:1'.PHP_EOL, 200),
    ]);

    $validator = Validator::make(['password' => $password], [
        'password' => [new StrongPassword],
    ]);

    expect($validator->passes())->toBeTrue();
});

it('fails open and logs when the HIBP range API is unavailable', function (): void {
    $password = 'Unavailable123!';
    [$prefix] = passwordHashParts($password);

    Log::spy();
    Http::fake([
        'https://api.pwnedpasswords.com/range/'.$prefix => Http::response('Bad Gateway', 502),
    ]);

    $validator = Validator::make(['password' => $password], [
        'password' => [new StrongPassword],
    ]);

    expect($validator->passes())->toBeTrue();

    Log::shouldHaveReceived('warning')
        ->once()
        ->with('Password breach screening failed open after non-success response.', Mockery::on(
            fn (array $context): bool => $context['hash_prefix'] === $prefix && $context['status'] === 502,
        ));
});

/** @return array{0: string, 1: string} */
function passwordHashParts(string $password): array
{
    $hash = strtoupper(sha1($password));

    return [substr($hash, 0, 5), substr($hash, 5)];
}
