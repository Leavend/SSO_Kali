<?php

declare(strict_types=1);

it('issue admin clients stress has a live k6 script with guard assertions', function (): void {
    $script = adminClientsTddEvidenceFile('tests/Stress/sso_admin_clients_prod_stress.js');

    expect($script)
        ->toContain('STRESS_CLIENT_ID_PARAM')
        ->toContain('/admin/api/clients')
        ->toContain('/admin/api/clients/${CLIENT_ID}')
        ->toContain('/admin/api/clients/${CLIENT_ID}/scopes')
        ->toContain('rejects without bearer token')
        ->toContain('is not 5xx')
        ->toContain('does not expose sensitive material')
        ->toContain('[401, 405, 429].includes(r.status)')
        ->toContain('access_token|id_token|refresh_token|client_secret|password|private_key');
});

it('issue admin clients stress has a same region vps latency probe', function (): void {
    $script = adminClientsTddEvidenceFile('scripts/sso-backend-admin-clients-vps-latency-probe.sh');

    expect($script)
        ->toContain('BASE_URL="${BASE_URL:-https://api-sso.timeh.my.id}"')
        ->toContain('EXPECTED_STATUSES="${EXPECTED_STATUSES:-401 405 429}"')
        ->toContain('P95_TARGET_MS="${P95_TARGET_MS:-500}"')
        ->toContain('"GET /admin/api/clients"')
        ->toContain('"POST /admin/api/clients"')
        ->toContain('"GET /admin/api/clients/c1"')
        ->toContain('"PUT /admin/api/clients/c1"')
        ->toContain('"DELETE /admin/api/clients/c1"')
        ->toContain('"PUT /admin/api/clients/c1/scopes"')
        ->toContain('unexpected = {s: c for s, c in statuses.items() if s not in expected}');
});

it('issue admin clients stress is exposed through the devops maintenance workflow', function (): void {
    $workflow = adminClientsTddEvidenceFile('.github/workflows/vps-maintenance.yml');

    expect($workflow)
        ->toContain('probe-sso-admin-clients-latency')
        ->toContain('Probe SSO admin clients latency from VPS')
        ->toContain('scripts/sso-backend-admin-clients-vps-latency-probe.sh')
        ->toContain('P95_TARGET_MS=500');
});

function adminClientsTddEvidenceFile(string $relativePath, array $skipRoots = []): string
{
    $candidates = [
        base_path($relativePath),
        dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, '/'),
        dirname(base_path(), 3).DIRECTORY_SEPARATOR.ltrim($relativePath, '/'),
    ];

    foreach ($skipRoots as $skip) {
        $candidates = array_values(array_filter(
            $candidates,
            static fn (string $candidate): bool => ! str_contains($candidate, $skip.DIRECTORY_SEPARATOR),
        ));
    }

    $resolved = null;
    foreach ($candidates as $candidate) {
        if (is_file($candidate)) {
            $resolved = $candidate;
            break;
        }
    }

    expect($resolved)->not->toBeNull();

    return (string) file_get_contents((string) $resolved);
}
