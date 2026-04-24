<?php

declare(strict_types=1);

use App\Support\Security\ClientSecretHashPolicy;

it('keeps the documented argon2id parameter artifact aligned with runtime policy', function (): void {
    $artifact = policyArtifact();
    $runtime = app(ClientSecretHashPolicy::class)->parameters();

    expect($artifact['algorithm'])->toBe('argon2id')
        ->and($artifact['memory_cost_kib'])->toBe($runtime['memory_cost'])
        ->and($artifact['time_cost'])->toBe($runtime['time_cost'])
        ->and($artifact['threads'])->toBe($runtime['threads']);
});

it('documents an owasp baseline that is not weaker than the enforced runtime policy floor', function (): void {
    $artifact = policyArtifact();
    $minimum = $artifact['owasp_minimum'];

    expect($artifact['memory_cost_kib'])->toBeGreaterThanOrEqual($minimum['memory_cost_kib'])
        ->and($artifact['time_cost'])->toBeGreaterThanOrEqual($minimum['time_cost'])
        ->and($artifact['threads'])->toBeGreaterThanOrEqual($minimum['threads']);
});

/**
 * @return array{
 *   algorithm:string,
 *   memory_cost_kib:int,
 *   time_cost:int,
 *   threads:int,
 *   owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}
 * }
 */
function policyArtifact(): array
{
    $content = file_get_contents(dirname(base_path(), 2).'/docs/security/argon2id-parameters.json');

    return json_decode((string) $content, true, 512, JSON_THROW_ON_ERROR);
}
