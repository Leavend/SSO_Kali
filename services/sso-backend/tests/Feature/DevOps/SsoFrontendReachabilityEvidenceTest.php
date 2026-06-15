<?php

declare(strict_types=1);

/**
 * Regression guard for the 2026-06-15 production incident where Traefik
 * routed through a configured Docker network name (`sso-main`) that did not
 * actually exist because Compose prefixed the network with the project name.
 * The result was a broken proxy path for hashed frontend assets and 404s from
 * the production smoke checks.
 */
it('pins the production proxy and frontend services to the same stable docker network', function (): void {
    $compose = file_get_contents(frontend_reachability_file('docker-compose.main.yml'));

    expect($compose)->toBeString()
        ->and($compose)->toContain('--providers.docker.network=sso-main')
        ->and($compose)->toContain('name: sso-main')
        ->and($compose)->toContain('traefik.docker.network=sso-main')
        ->and($compose)->toContain('sso-frontend:')
        ->and($compose)->toContain('sso-admin-frontend:');
});

it('keeps the deploy script on compose-managed networking instead of manual network patching', function (): void {
    $script = file_get_contents(frontend_reachability_file('scripts/vps-deploy-main.sh'));

    expect($script)->toBeString()
        ->and($script)->toContain('compose up -d --remove-orphans --force-recreate sso-backend sso-backend-worker sso-backend-scheduler sso-frontend sso-admin-frontend sso-docs proxy')
        ->and($script)->toContain('assert_service_on_network sso-frontend sso-main')
        ->and($script)->toContain('assert_service_on_network proxy sso-main')
        ->and($script)->not->toContain('reattach_frontend_to_backend_network')
        ->and($script)->not->toContain('docker network connect')
        ->and($script)->not->toContain('_sso-main');
});

it('verifies the frontend release through proxied asset smoke on the prod host route', function (): void {
    $script = file_get_contents(frontend_reachability_file('scripts/vps-deploy-main.sh'));

    expect($script)->toBeString()
        ->and($script)->toContain('frontend_asset_path sso-frontend')
        ->and($script)->toContain("smoke_proxy_route 'Frontend proxy asset'")
        ->and($script)->toContain('PROXY_HTTP_PUBLISHED_PORT:-18080')
        ->and($script)->toContain('Host: $host');
});

function frontend_reachability_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
