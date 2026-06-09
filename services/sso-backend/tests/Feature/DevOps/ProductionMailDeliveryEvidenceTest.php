<?php

declare(strict_types=1);

it('passes production SMTP settings into the backend queue runtime', function (): void {
    $compose = file_get_contents(production_mail_repository_path('docker-compose.main.yml'));

    expect($compose)->toBeString()
        ->and($compose)->toContain('APP_NAME: ${APP_NAME:-Dev-SSO}')
        ->and($compose)->toContain('MAIL_MAILER: ${MAIL_MAILER:-log}')
        ->and($compose)->toContain('MAIL_SCHEME: ${MAIL_SCHEME:-}')
        ->and($compose)->toContain('MAIL_URL: ${MAIL_URL:-null}')
        ->and($compose)->toContain('MAIL_HOST: ${MAIL_HOST:-127.0.0.1}')
        ->and($compose)->toContain('MAIL_PORT: ${MAIL_PORT:-2525}')
        ->and($compose)->toContain('MAIL_USERNAME: ${MAIL_USERNAME:-}')
        ->and($compose)->toContain('MAIL_PASSWORD: ${MAIL_PASSWORD:-}')
        ->and($compose)->toContain('MAIL_EHLO_DOMAIN: ${MAIL_EHLO_DOMAIN:-api-sso.timeh.my.id}')
        ->and($compose)->toContain('MAIL_FROM_ADDRESS: ${MAIL_FROM_ADDRESS:-hello@example.com}')
        ->and($compose)->toContain('SECURITY_NOTIFICATIONS_ENABLED: ${SECURITY_NOTIFICATIONS_ENABLED:-true}')
        ->and($compose)->toContain('SECURITY_NOTIFICATIONS_FROM_ADDRESS')
        ->and($compose)->toContain('--queue=notifications,default')
        ->and(substr_count($compose, 'healthcheck:'.PHP_EOL.'      disable: true'))->toBe(2)
        ->and(substr_count($compose, 'environment: *sso-backend-env'))->toBe(3);
});

it('keeps production SMTP credentials secret-driven in deployment assets', function (): void {
    $workflow = file_get_contents(production_mail_repository_path('.github/workflows/deploy-main.yml'));
    $mailConfig = file_get_contents(production_mail_repository_path('services/sso-backend/config/mail.php'));
    $envExample = file_get_contents(production_mail_repository_path('.env.sso-backend.example'));

    expect($workflow)->toBeString()
        ->and($workflow)->toContain('VPS_ENV_PROD: ${{ secrets.VPS_ENV_PROD }}')
        ->and($workflow)->toContain('Install production env on VPS')
        ->and($workflow)->not->toContain('MAIL_PASSWORD=')
        ->and($mailConfig)->toContain("'url' => env('MAIL_URL') ?: null")
        ->and($envExample)->toContain('MAIL_MAILER=smtp')
        ->and($envExample)->toContain('APP_NAME=Dev-SSO')
        ->and($envExample)->toContain('MAIL_HOST=mail.bontangtechnohub.com')
        ->and($envExample)->toContain('MAIL_PASSWORD=CHANGE_ME')
        ->and($envExample)->toContain('SSO_WORKER_QUEUE=notifications,default')
        ->and($envExample)->toContain('SECURITY_NOTIFICATIONS_FROM_NAME="Dev-SSO Security"');
});

function production_mail_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
