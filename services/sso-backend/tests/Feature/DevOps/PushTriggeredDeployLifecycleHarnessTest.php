<?php

declare(strict_types=1);

it('keeps push-triggered deploy-main resilient to transient ssh keyscan failures', function (): void {
    $workflow = deploy_main_push_lifecycle_file('.github/workflows/deploy-main.yml');
    $content = file_get_contents($workflow);

    expect($content)->toBeString()
        ->and($content)->toContain('push:')
        ->and($content)->toContain('branches: [main]')
        ->and($content)->toContain('workflow_dispatch:')
        ->and($content)->toContain('VPS_SSH_KNOWN_HOSTS')
        ->and($content)->toContain('ssh_with_retry()')
        ->and($content)->toContain('rsync_with_retry()')
        ->and($content)->toContain('ConnectTimeout=45')
        ->and($content)->toContain('ConnectionAttempts=3')
        ->and($content)->toContain('ssh-keyscan attempt ${attempt} failed')
        ->and($content)->toContain('StrictHostKeyChecking=accept-new')
        ->and($content)->toContain('VPS_SSH_KEY secret is required')
        ->and($content)->toContain('VPS_HOST secret is required')
        ->and($content)->toContain('COMPOSE_PROJECT_NAME: sso-backend-prod')
        ->and($content)->toContain('sso-backend-deploy')
        ->and($content)->not->toContain('sso-kali-deploy');
});

function deploy_main_push_lifecycle_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
