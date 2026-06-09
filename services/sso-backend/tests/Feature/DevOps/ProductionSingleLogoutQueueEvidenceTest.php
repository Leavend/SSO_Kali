<?php

declare(strict_types=1);

it('keeps production workers subscribed to admin single-logout fanout jobs', function (): void {
    $compose = file_get_contents(production_single_logout_repository_path('docker-compose.main.yml'));
    $envExample = file_get_contents(production_single_logout_repository_path('.env.sso-backend.example'));
    $job = file_get_contents(production_single_logout_repository_path('services/sso-backend/app/Jobs/DispatchBackChannelLogoutJob.php'));
    $config = file_get_contents(production_single_logout_repository_path('services/sso-backend/config/oidc_clients.php'));

    expect($job)->toContain("\$this->onQueue('backchannel-logout')")
        ->and($compose)->toContain('--queue=${SSO_WORKER_QUEUE:-backchannel-logout,notifications,default}')
        ->and($envExample)->toContain('SSO_WORKER_QUEUE=backchannel-logout,notifications,default')
        ->and($config)->toContain('ADMIN_PANEL_BACKCHANNEL_LOGOUT_URI')
        ->and($config)->toContain('/connect/backchannel/admin-panel/logout')
        ->and($compose)->toContain('sso-backend-worker:')
        ->and($compose)->toContain('command: ["php", "artisan", "queue:work", "redis"');
});

function production_single_logout_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
