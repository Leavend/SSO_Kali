<?php

declare(strict_types=1);

namespace App\Support\Oidc;

use RuntimeException;

final class SsoEngineConfig
{
    public function usesNative(): bool
    {
        return $this->engine() === 'native';
    }

    public function usesUpstream(): bool
    {
        return $this->engine() === 'upstream';
    }

    public function assertStartupConfiguration(): void
    {
        $engine = $this->engine();

        if (! in_array($engine, ['native', 'upstream'], true)) {
            throw new RuntimeException('SSO_ENGINE must be either native or upstream.');
        }

        if ($engine === 'upstream' && trim((string) config('sso.upstream_oidc.client_id', '')) === '') {
            throw new RuntimeException('SSO_ENGINE=upstream requires sso.upstream_oidc.client_id / OIDC_UPSTREAM_CLIENT_ID.');
        }
    }

    private function engine(): string
    {
        return strtolower(trim((string) config('sso.engine', 'native')));
    }
}
