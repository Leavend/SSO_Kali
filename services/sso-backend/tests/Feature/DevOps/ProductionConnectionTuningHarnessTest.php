<?php

declare(strict_types=1);

it('keeps connection pressure tuning script idempotent auditable and rollback-safe', function (): void {
    $script = connection_tuning_repository_file('scripts/vps-apply-sso-connection-tuning.sh');
    $content = file_get_contents($script);

    expect($script)->toBeFile()
        ->and($content)->toBeString()
        ->and($content)->toContain('--mode audit|apply')
        ->and($content)->toContain('worker_rlimit_nofile 65535')
        ->and($content)->toContain('worker_connections 4096')
        ->and($content)->toContain('multi_accept on')
        ->and($content)->toContain('keepalive_timeout 30s')
        ->and($content)->toContain('keepalive_requests 10000')
        ->and($content)->toContain('ssl_session_cache shared:SSL:20m')
        ->and($content)->toContain('ssl_session_tickets off')
        ->and($content)->toContain('proxy_http_version 1.1')
        ->and($content)->toContain('proxy_set_header Connection ""')
        ->and($content)->toContain('proxy_buffering on')
        ->and($content)->toContain('proxy_buffers 16 16k')
        ->and($content)->toContain('net.core.somaxconn = 4096')
        ->and($content)->toContain('net.ipv4.tcp_max_syn_backlog = 4096')
        ->and($content)->toContain('nginx -t')
        ->and($content)->toContain('systemctl reload nginx')
        ->and($content)->toContain('pre-sso-connection-tuning')
        ->and($content)->not->toContain('docker system prune')
        ->and($content)->not->toContain('client_secret');
});

it('documents connection pressure tuning verification rollback and wrk comparison', function (): void {
    $runbook = connection_tuning_repository_file('docs/devops/sso-backend-connection-tuning.md');
    $content = file_get_contents($runbook);

    expect($runbook)->toBeFile()
        ->and($content)->toContain('PASS with warning')
        ->and($content)->toContain('connect errors 253')
        ->and($content)->toContain('timeouts 34')
        ->and($content)->toContain('scripts/vps-apply-sso-connection-tuning.sh')
        ->and($content)->toContain('--mode audit')
        ->and($content)->toContain('--mode apply')
        ->and($content)->toContain('scripts/sso-backend-public-smoke.sh')
        ->and($content)->toContain('scripts/sso-backend-metadata-wrk-smoke.sh')
        ->and($content)->toContain('Rollback')
        ->and($content)->toContain('worker_connections 4096')
        ->and($content)->toContain('proxy_http_version 1.1')
        ->and($content)->toContain('Octane/FrankenPHP workers')
        ->and($content)->not->toContain('plaintext secret');
});

function connection_tuning_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
