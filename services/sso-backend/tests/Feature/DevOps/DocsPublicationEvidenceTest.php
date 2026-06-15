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
        ->toContain('docs.sso.timeh.my.id')
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
        ->toContain('COPY docs/onboarding/')
        ->toContain('CONTENT_SOURCE_ROOT')
        ->toContain('sync-content.sh')
        ->toContain('npm run docs:build')
        ->toContain('nginx:alpine');
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
        ->toContain('/resource-server')
        ->toContain('/integrations/laravel')
        ->toContain('/integrations/nextjs')
        ->toContain('/integrations/vuejs')
        ->toContain('/integrations/express')
        ->toContain('/en/')
        ->toContain('/en/integrations/laravel');
});

it('publishes framework guides with mandatory S256 and placeholder-only secrets', function (): void {
    foreach (['', 'en/'] as $locale) {
        foreach (['laravel', 'nextjs', 'vuejs', 'express'] as $framework) {
            $guide = docsPublicationFile("docs/developers/{$locale}integrations/{$framework}.md");

            expect($guide)
                ->toContain('S256')
                ->not->toMatch('/client_secret\s*[:=]\s*[\'"][^<{][^\'"]{15,}[\'"]/i');
        }
    }

    expect(docsPublicationFile('docs/developers/integrations/laravel.md'))
        ->toContain('confidential client')
        ->toContain("'client_secret'");

    expect(docsPublicationFile('docs/developers/integrations/express.md'))
        ->toContain('confidential client')
        ->toContain('client_secret:');

    expect(docsPublicationFile('docs/developers/integrations/nextjs.md'))
        ->toContain('confidential BFF')
        ->toContain('SPA-Only')
        ->toContain('public client');

    expect(docsPublicationFile('docs/developers/integrations/vuejs.md'))
        ->toContain('public client')
        ->toContain('VITE_SSO_CLIENT_SECRET')
        ->not->toContain('VITE_SSO_CLIENT_SECRET=');
});

it('keeps English documentation in parity with every registered Indonesian page', function (): void {
    $developerPages = [
        'README.md',
        'api-reference.md',
        'errors.md',
        'resource-server.md',
        'scopes-and-claims.md',
        'security-model.md',
        'integrations/laravel.md',
        'integrations/nextjs.md',
        'integrations/vuejs.md',
        'integrations/express.md',
    ];

    foreach ($developerPages as $page) {
        expect(docsPublicationPath("docs/developers/{$page}"))->toBeFile()
            ->and(docsPublicationPath("docs/developers/en/{$page}"))->toBeFile();
    }

    expect(docsPublicationPath('docs/onboarding/client-web-app-onboarding.md'))->toBeFile()
        ->and(docsPublicationPath('docs/onboarding/en/client-web-app-onboarding.md'))->toBeFile();
});

it('configures localized navigation without repository edit links', function (): void {
    $config = docsPublicationFile('services/sso-docs/.vitepress/config.ts');

    expect($config)
        ->toContain('locales:')
        ->toContain("lang: 'id'")
        ->toContain("lang: 'en'")
        ->toContain("link: '/en/'")
        ->toContain('https://github.com/Leavend/SSO_Kali')
        ->not->toContain('editLink')
        ->not->toContain('Edit halaman ini di GitHub')
        ->not->toContain('github.com/leavend/sso-kali');
});

it('syncs developer and onboarding directories for both locales', function (): void {
    $script = docsPublicationFile('services/sso-docs/sync-content.sh');

    expect($script)
        ->toContain('CONTENT_SOURCE_ROOT')
        ->toContain('developers')
        ->toContain('onboarding')
        ->toContain('integrations')
        ->toContain('en');
});

it('ensures sso-docs markdown files are git-tracked via gitignore exception', function (): void {
    $gitignore = docsPublicationFile('.gitignore');

    // Must have exception for sso-docs markdown files
    expect($gitignore)
        ->toContain('!services/sso-docs/**/*.md');
});

it('includes sso-docs in the VPS deploy script', function (): void {
    $script = docsPublicationFile('scripts/vps-deploy-main.sh');

    expect($script)
        ->toContain('compose pull sso-backend sso-backend-worker sso-backend-scheduler sso-frontend sso-admin-frontend sso-docs')
        ->toContain('compose up -d --remove-orphans --force-recreate sso-backend sso-backend-worker sso-backend-scheduler sso-frontend sso-admin-frontend sso-docs proxy')
        ->toContain('wait_for_service sso-docs');
});

function docsPublicationFile(string $relativePath): string
{
    $path = docsPublicationPath($relativePath);

    return (string) file_get_contents($path);
}

function docsPublicationPath(string $relativePath): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, '/');
}
