<?php

declare(strict_types=1);

namespace App\Services\System;

enum ServiceHealthProbeTarget: string
{
    case Portal = 'sso-portal';
    case Admin = 'admin-sso';
    case Backend = 'sso-backend';

    public function configKey(): string
    {
        return match ($this) {
            self::Portal => 'sso.observability.targets.portal_url',
            self::Admin => 'sso.observability.targets.admin_url',
            self::Backend => 'sso.observability.targets.backend_url',
        };
    }

    public function cacheKey(): string
    {
        return 'service_health_probe:'.$this->value;
    }
}
