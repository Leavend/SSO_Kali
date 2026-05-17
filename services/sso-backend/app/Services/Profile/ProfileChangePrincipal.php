<?php

declare(strict_types=1);

namespace App\Services\Profile;

use App\Models\User;
use App\Support\Oidc\OidcScope;
use App\Support\Oidc\ScopeSet;
use Illuminate\Http\Request;
use RuntimeException;

final class ProfileChangePrincipal
{
    public function __construct(private readonly ProfilePrincipalResolver $principals) {}

    /** @return array{user: User, claims: array<string, mixed>} */
    public function resolve(Request $request): array
    {
        $principal = $this->principals->resolve($request);
        $this->assertProfileScope($principal['claims']);

        return ['user' => $principal['user'], 'claims' => $principal['claims']];
    }

    /** @param array<string, mixed> $claims */
    private function assertProfileScope(array $claims): void
    {
        $scope = is_string($claims['scope'] ?? null) ? $claims['scope'] : '';
        if (! ScopeSet::contains(ScopeSet::fromString($scope), OidcScope::PROFILE)) {
            throw new RuntimeException('profile scope is required.');
        }
    }
}
