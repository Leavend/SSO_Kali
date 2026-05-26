<?php

declare(strict_types=1);

namespace App\Services\Oidc;

final class OidcFoundationSnapshotBuilder
{
    public function __construct(private readonly OidcCatalog $catalog) {}

    /**
     * @return array<string, mixed>
     */
    public function build(?string $correlationId): array
    {
        $checkedAt = now()->toIso8601String();
        $discovery = $this->catalog->discovery();
        $jwks = $this->catalog->jwks();
        $issuer = $this->stringValue($discovery, 'issuer');
        $configuredIssuer = $this->configuredIssuer();
        $publicBaseUrl = $this->publicBaseUrl();

        return [
            'discovery' => $this->discovery($discovery),
            'jwks' => $this->jwks($jwks),
            'availability' => [
                'discovery' => $this->unknownAvailability('Discovery metadata'),
                'jwks' => $this->unknownAvailability('JWKS public keys'),
            ],
            'evidence' => [
                'jwks_rotation' => [
                    'status' => 'missing',
                    'label' => 'JWKS rotation evidence belum tercatat',
                    'environment' => null,
                    'latest_drill_at' => null,
                    'operator_signoff' => null,
                    'evidence_ref' => null,
                ],
                'availability_timeline' => [],
            ],
            'catalog' => $this->catalog($discovery),
            'issuer_consistency' => [
                'status' => $issuer === $configuredIssuer ? 'pass' : 'warning',
                'configured_issuer' => $configuredIssuer,
                'discovery_issuer' => $issuer,
                'public_base_url' => $publicBaseUrl,
                'last_checked_at' => $checkedAt,
            ],
            'endpoint_consistency' => $this->endpointConsistency($discovery),
            'checked_at' => $checkedAt,
            'correlation_id' => $correlationId,
        ];
    }

    /**
     * @param  array<string, mixed>  $discovery
     * @return array<string, mixed>
     */
    private function discovery(array $discovery): array
    {
        return [
            'issuer' => $this->stringValue($discovery, 'issuer'),
            'authorization_endpoint' => $this->stringValue($discovery, 'authorization_endpoint'),
            'token_endpoint' => $this->stringValue($discovery, 'token_endpoint'),
            'jwks_uri' => $this->stringValue($discovery, 'jwks_uri'),
            'userinfo_endpoint' => $this->stringValue($discovery, 'userinfo_endpoint'),
            'response_types_supported' => $this->stringList($discovery, 'response_types_supported'),
            'grant_types_supported' => $this->stringList($discovery, 'grant_types_supported'),
            'scopes_supported' => $this->stringList($discovery, 'scopes_supported'),
            'claims_supported' => $this->stringList($discovery, 'claims_supported'),
            'id_token_signing_alg_values_supported' => $this->stringList($discovery, 'id_token_signing_alg_values_supported'),
        ];
    }

    /**
     * @param  array<string, mixed>  $jwks
     * @return array<string, mixed>
     */
    private function jwks(array $jwks): array
    {
        $keys = is_array($jwks['keys'] ?? null) ? $jwks['keys'] : [];

        return [
            'keys' => array_values(array_map(function (mixed $key): array {
                $publicKey = is_array($key) ? $key : [];

                return [
                    'kid' => $this->stringValue($publicKey, 'kid'),
                    'alg' => $this->stringValue($publicKey, 'alg'),
                    'use' => $this->stringValue($publicKey, 'use'),
                    'status' => 'published',
                    'published_at' => null,
                    'rotated_at' => null,
                ];
            }, $keys)),
        ];
    }

    /**
     * @return array{name: string, status: string, http_status: null, latency_ms: null, last_checked_at: null, evidence_ref: null}
     */
    private function unknownAvailability(string $name): array
    {
        return [
            'name' => $name,
            'status' => 'unknown',
            'http_status' => null,
            'latency_ms' => null,
            'last_checked_at' => null,
            'evidence_ref' => null,
        ];
    }

    /**
     * @param  array<string, mixed>  $discovery
     * @return array<string, mixed>
     */
    private function catalog(array $discovery): array
    {
        return [
            'scopes' => array_map(fn (string $scope): array => [
                'name' => $scope,
                'label' => $this->scopeLabel($scope),
                'description' => $this->scopeDescription($scope),
                'label_status' => $this->scopeLabel($scope) === $scope ? 'missing_label' : 'mapped',
            ], $this->stringList($discovery, 'scopes_supported')),
            'claims' => array_map(fn (string $claim): array => [
                'name' => $claim,
                'scope_dependency' => $this->claimScope($claim),
                'sensitivity' => in_array($claim, ['email', 'email_verified', 'name'], true) ? 'personal_data' : 'protocol',
            ], $this->stringList($discovery, 'claims_supported')),
            'algorithms' => array_map(fn (string $algorithm): array => [
                'name' => $algorithm,
                'usage' => 'id_token_signing',
                'status' => 'active',
            ], $this->stringList($discovery, 'id_token_signing_alg_values_supported')),
        ];
    }

    /**
     * @param  array<string, mixed>  $discovery
     * @return list<array{name: string, discovered_url: string, expected_url: string, status: string}>
     */
    private function endpointConsistency(array $discovery): array
    {
        $baseUrl = $this->publicBaseUrl();
        $expected = [
            'authorization_endpoint' => $baseUrl.'/authorize',
            'token_endpoint' => $baseUrl.'/token',
            'jwks_uri' => $baseUrl.'/.well-known/jwks.json',
            'userinfo_endpoint' => $baseUrl.'/userinfo',
            'introspection_endpoint' => $baseUrl.'/introspect',
            'revocation_endpoint' => $baseUrl.'/oauth/revoke',
            'end_session_endpoint' => $baseUrl.'/connect/logout',
        ];

        return array_map(fn (string $name, string $expectedUrl): array => [
            'name' => $name,
            'discovered_url' => $this->stringValue($discovery, $name),
            'expected_url' => $expectedUrl,
            'status' => $this->stringValue($discovery, $name) === $expectedUrl ? 'pass' : 'mismatch',
        ], array_keys($expected), array_values($expected));
    }

    private function configuredIssuer(): string
    {
        return rtrim((string) config('sso.issuer'), '/');
    }

    private function publicBaseUrl(): string
    {
        return rtrim((string) config('sso.base_url'), '/');
    }

    /**
     * @param  array<string, mixed>  $values
     */
    private function stringValue(array $values, string $key): string
    {
        $value = $values[$key] ?? '';

        return is_string($value) ? $value : '';
    }

    /**
     * @param  array<string, mixed>  $values
     * @return list<string>
     */
    private function stringList(array $values, string $key): array
    {
        $value = $values[$key] ?? [];

        if (! is_array($value)) {
            return [];
        }

        return array_values(array_map('strval', $value));
    }

    private function scopeLabel(string $scope): string
    {
        return match ($scope) {
            'openid' => 'Identitas OpenID',
            'profile' => 'Profil Pengguna',
            'email' => 'Alamat Email',
            'offline_access' => 'Akses Offline',
            'roles' => 'Peran',
            'permissions' => 'Izin',
            default => $scope,
        };
    }

    private function scopeDescription(string $scope): string
    {
        return match ($scope) {
            'openid' => 'Mengizinkan client mengetahui bahwa user login melalui SSO.',
            'profile' => 'Mengizinkan akses ke claim profil dasar.',
            'email' => 'Mengizinkan akses ke alamat email dan status verifikasi.',
            'offline_access' => 'Mengizinkan refresh session sesuai policy backend.',
            'roles' => 'Mengizinkan akses ke daftar role yang ditugaskan.',
            'permissions' => 'Mengizinkan akses ke daftar izin yang diberikan.',
            default => 'Scope custom perlu review label dan consent copy.',
        };
    }

    private function claimScope(string $claim): ?string
    {
        return match ($claim) {
            'email', 'email_verified' => 'email',
            'name', 'given_name', 'family_name' => 'profile',
            default => null,
        };
    }
}
