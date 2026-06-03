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
        // ConnectTimeout and ConnectionAttempts are now defined exclusively in
        // ssh_with_retry() / rsync_with_retry() (exponential backoff redesign).
        // 20s ConnectTimeout gives each attempt a tight window while the 8-retry
        // exponential-backoff policy provides the total resilience budget.
        ->and($content)->toContain('ConnectTimeout=20')
        ->and($content)->toContain('ConnectionAttempts=1')
        // Exponential backoff and per-step retry counts are documented as env defaults.
        ->and($content)->toContain("VPS_SSH_ATTEMPTS || '8'")
        // Port availability probe before SSH attempts (non-blocking so SSH retries
        // still run if the gate times out).
        ->and($content)->toContain('Wait for VPS SSH port availability')
        ->and($content)->toContain('continue-on-error: true')
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
