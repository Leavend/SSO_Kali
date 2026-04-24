<?php

declare(strict_types=1);

namespace App\Providers;

use App\Support\Telescope\TelescopeAccessPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\ServiceProvider;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\TelescopeApplicationServiceProvider;

// Telescope is a dev-only dependency. When installed, this provider
// delegates to TelescopeApplicationServiceProvider. In production
// builds (composer --no-dev), it silently becomes a no-op.
if (class_exists(TelescopeApplicationServiceProvider::class)) {
    /** @internal used only when telescope package is present */
    abstract class TelescopeServiceProviderBase extends TelescopeApplicationServiceProvider {}
} else {
    /** @internal stub when telescope is not installed */
    abstract class TelescopeServiceProviderBase extends ServiceProvider {}
}

final class TelescopeServiceProvider extends TelescopeServiceProviderBase
{
    public function register(): void
    {
        if (! $this->telescopeAvailable()) {
            return;
        }

        $this->hideSensitiveRequestDetails();
        Telescope::filter(
            fn (IncomingEntry $entry): bool => $this->shouldRecordEntry($entry),
        );
    }

    protected function authorization(): void
    {
        if (! $this->telescopeAvailable()) {
            return;
        }

        Telescope::auth(
            fn (Request $request): bool => $this->policy()->allows($request),
        );
    }

    protected function hideSensitiveRequestDetails(): void
    {
        Telescope::hideRequestParameters([
            '_token', 'password', 'password_confirmation',
            'current_password', 'client_secret', 'access_token',
            'refresh_token', 'id_token', 'logout_token',
            'code', 'state', 'nonce',
        ]);

        Telescope::hideRequestHeaders([
            'authorization', 'cookie', 'set-cookie',
            'x-csrf-token', 'x-xsrf-token',
        ]);
    }

    private function shouldRecordEntry(IncomingEntry $entry): bool
    {
        if ($this->policy()->shouldRecordAll()) {
            return true;
        }

        return $entry->isReportableException()
            || $entry->isFailedRequest()
            || $entry->isFailedJob()
            || $entry->isScheduledTask()
            || $entry->hasMonitoredTag();
    }

    private function policy(): TelescopeAccessPolicy
    {
        return app(TelescopeAccessPolicy::class);
    }

    private function telescopeAvailable(): bool
    {
        return class_exists(Telescope::class);
    }
}
