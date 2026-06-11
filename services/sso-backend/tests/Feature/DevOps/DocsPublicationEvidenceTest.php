<?php

declare(strict_types=1);

it('includes sso-docs in the GitHub Actions deploy matrix', function (): void {
    $workflow = docsPublicationFile('.github/workflows/deploy-main.yml');

    expect($workflow)
        ->toContain('service: sso-docs')
        ->toContain('dockerfile: ./services/sso-docs/Dockerfile')
        ->toContain('context: ./');
});

it('defines sso-docs service in docker-compose with correct upstream port', function (): void {
    $compose = docsPublicationFile('docker-compose.main.yml');

    expect($compose)
        ->toContain('sso-docs:')
        ->toContain('sso-docs-prod')
        ->toContain('SSO_DOCS_BIND')
        ->toContain('8190')
        ->toContain('sso-main')
        ->toContain('wget -qO- http://127.0.0.1/');
});

it('has VPS nginx route script for docs subdomain', function (): void {
    $script = docsPublicationFile('scripts/vps-apply-sso-docs-route.sh');

    expect($script)
        ->toContain('docs.sso.timeh.my.id')
        ->toContain('127.0.0.1:8190')
        ->toContain('--mode')
        ->toContain('certbot')
        ->toContain('ssl_certificate')
        ->toContain('Strict-Transport-Security')
        ->toContain('assert_no_edge_auth_middleware');
});

it('wires docs route script into deploy workflow', function (): void {
    $workflow = docsPublicationFile('.github/workflows/deploy-main.yml');

    expect($workflow)
        ->toContain('vps-apply-sso-docs-route.sh')
        ->toContain('Apply docs route on VPS')
        ->toContain('SSO_DOCS_DOMAIN')
        ->toContain('SSO_DOCS_UPSTREAM');
});

it('copies docs/developers content in Dockerfile for single-source', function (): void {
    $dockerfile = docsPublicationFile('services/sso-docs/Dockerfile');

    expect($dockerfile)
        ->toContain('COPY docs/developers/')
        ->toContain('COPY docs/onboarding/client-web-app-onboarding.md')
        ->toContain('npm run docs:build')
        ->toContain('nginx:alpine')
        ->toContain('sed -i') // Link rewrite for VitePress
        ->toContain('../onboarding/client-web-app-onboarding.md')
        ->toContain('/onboarding');
});

it('configures admin frontend with docs base URL environment', function (): void {
    $compose = docsPublicationFile('docker-compose.main.yml');

    expect($compose)
        ->toContain('VITE_DOCS_BASE_URL');

    $dockerfile = docsPublicationFile('services/sso-admin-frontend/Dockerfile');

    expect($dockerfile)
        ->toContain('ARG VITE_DOCS_BASE_URL')
        ->toContain('ENV VITE_DOCS_BASE_URL');
});

it('includes docs production smoke test in workflow', function (): void {
    $workflow = docsPublicationFile('.github/workflows/deploy-main.yml');

    expect($workflow)
        ->toContain('Run docs production smoke')
        ->toContain('docs.sso.timeh.my.id')
        ->toContain('Dev-SSO');
});

it('provides LLM-readable documentation index at llms.txt', function (): void {
    $llmsTxt = docsPublicationFile('services/sso-docs/public/llms.txt');

    expect($llmsTxt)
        ->toContain('https://docs.sso.timeh.my.id')
        ->toContain('/onboarding')
        ->toContain('/api-reference')
        ->toContain('/scopes-and-claims')
        ->toContain('/errors')
        ->toContain('/security-model')
        ->toContain('/resource-server');
});

it('ensures sso-docs markdown files are git-tracked via gitignore exception', function (): void {
    $gitignore = docsPublicationFile('.gitignore');

    // Must have exception for sso-docs markdown files
    expect($gitignore)
        ->toContain('!services/sso-docs/**/*.md');
});

function docsPublicationFile(string $relativePath): string
{
    $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, '/');

    return (string) file_get_contents($path);
}
