<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Oidc\WidgetOriginPolicy;
use Illuminate\Console\Command;

final class FlushWidgetOriginCacheCommand extends Command
{
    protected $signature = 'sso:flush-widget-origin-cache';

    protected $description = 'Flush the cached credentialed widget CORS origin allow-list.';

    public function handle(WidgetOriginPolicy $origins): int
    {
        $origins->flush();
        $this->info('Widget origin cache flushed: '.WidgetOriginPolicy::CACHE_KEY);

        return self::SUCCESS;
    }
}
