<?php

declare(strict_types=1);

namespace App\Actions\Admin\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

final class ListExternalIdentityProvidersAction
{
    /**
     * @return LengthAwarePaginator<int, ExternalIdentityProvider>
     */
    public function execute(int $perPage = 25): LengthAwarePaginator
    {
        return ExternalIdentityProvider::query()
            ->orderBy('priority')
            ->orderBy('provider_key')
            ->paginate(min(max($perPage, 1), 100));
    }
}
