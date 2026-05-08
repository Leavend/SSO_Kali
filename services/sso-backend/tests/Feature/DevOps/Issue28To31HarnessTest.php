<?php

declare(strict_types=1);

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Jobs\DispatchBackChannelLogoutJob;

it('issue 28 harness redacts sensitive logout audit context recursively', function (): void {
    config(['logging.default' => 'single']);

    app(RecordLogoutAuditEventAction::class)->execute('harness_logout_event', [
        'client_id' => 'sso-admin-panel',
        'endpoint' => [
            'host' => 'client.example.test',
            'query' => [
                'logout_token' => 'must-not-leak',
                'client_secret' => 'must-not-leak',
                'password_hint' => 'must-not-leak',
            ],
        ],
    ]);

    $logFile = storage_path('logs/laravel.log');
    $content = is_file($logFile) ? (string) file_get_contents($logFile) : '';

    expect($content)->toContain('harness_logout_event')
        ->and($content)->toContain('sso-admin-panel')
        ->and($content)->toContain('client.example.test')
        ->and($content)->not->toContain('must-not-leak')
        ->and($content)->not->toContain('logout_token')
        ->and($content)->not->toContain('client_secret')
        ->and($content)->not->toContain('password_hint');
});

it('issue 29 harness keeps back-channel failure retry bounded and auditable', function (): void {
    $job = new DispatchBackChannelLogoutJob(
        'sso-load-test-client',
        'subject-harness',
        'sid-harness',
        'https://client.example.test/backchannel/logout?access_token=must-not-leak',
    );

    expect($job->tries)->toBe(3)
        ->and($job->backoff())->toBe([10, 30, 90]);
});

it('issue 30 harness documents oauth load-test client without committing secrets', function (): void {
    $runbook = repository_path('docs/devops/sso-backend-oauth-load-test.md');
    $registry = base_path('config/oidc_clients.php');

    expect($runbook)->toBeFile()
        ->and($registry)->toBeFile();

    $content = file_get_contents($runbook);
    $registryContent = file_get_contents($registry);

    expect($content)->toBeString()
        ->and($content)->toContain('client_credentials')
        ->and($content)->toContain('SSO_LOAD_TEST_CLIENT_SECRET')
        ->and($content)->toContain('SSO_LOAD_TEST_CLIENT_SECRET_HASH')
        ->and($content)->not->toMatch('/client_secret\s*=\s*[A-Za-z0-9_\-]{16,}/')
        ->and($registryContent)->toContain('SSO_LOAD_TEST_CLIENT_ENABLED')
        ->and($registryContent)->toContain('SSO_LOAD_TEST_CLIENT_SECRET_HASH')
        ->and($registryContent)->not->toContain('SSO_LOAD_TEST_CLIENT_SECRET\'');
});

it('issue 31 harness keeps production lifecycle free from removed legacy gates', function (): void {
    $files = [
        '.github/workflows/ci.yml',
        '.github/workflows/devops-lifecycle.yml',
        'scripts/validate-devops-lifecycle.sh',
        'services/sso-backend/tests/Feature/DevOps/BackendOnlyProductionLifecycleContractTest.php',
        'docs/devops/sso-backend-production-lifecycle.md',
    ];

    foreach ($files as $file) {
        $content = file_get_contents(repository_path($file));

        expect($content)->toBeString()
            ->and($content)->not->toContain('services/zitadel-login-vue')
            ->and($content)->not->toContain('infra/zitadel-login')
            ->and($content)->not->toContain('packages/dev-sso-parent-ui')
            ->and($content)->not->toContain('apps/app-a-next')
            ->and($content)->not->toContain('apps/app-b-laravel');
    }
});

it('issue 31 harness targets sso-backend-prod instead of legacy sso-kali compose project', function (): void {
    $files = [
        '.github/workflows/deploy-main.yml',
        'scripts/vps-deploy-main.sh',
        'scripts/sso-backend-vps-smoke.sh',
        'docs/devops/sso-backend-cicd.md',
        'docs/devops/sso-backend-production-lifecycle.md',
    ];

    foreach ($files as $file) {
        $content = file_get_contents(repository_path($file));

        expect($content)->toBeString()
            ->and($content)->toContain('sso-backend-prod')
            ->and($content)->not->toContain('/opt/sso-kali')
            ->and($content)->not->toContain('/tmp/sso-kali-deploy')
            ->and($content)->not->toContain('COMPOSE_PROJECT_NAME:-sso-kali')
            ->and($content)->not->toContain('COMPOSE_PROJECT_NAME=sso-kali');
    }
});

function repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
