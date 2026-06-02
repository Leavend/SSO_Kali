<?php

declare(strict_types=1);

namespace App\Support\Oidc;

use RuntimeException;

final class SsoEngineConfig
{
    public function usesNative(): bool
    {
        return true;
    }

    public function assertStartupConfiguration(): void
    {
        $engine = $this->engine();

        if ($engine !== 'native') {
            throw new RuntimeException('SSO_ENGINE must be native. Upstream OIDC broker mode has been removed.');
        }
    }

    private function engine(): string
    {
        return strtolower(trim((string) config('sso.engine', 'native')));
    }
}
