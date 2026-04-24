<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Services\Sso\AppSessionStore;
use App\Services\Sso\PkceService;
use App\Services\Sso\SsoHttpClient;
use Illuminate\Http\RedirectResponse;

final class StartLogin
{
    public function __construct(
        private readonly PkceService $pkce,
        private readonly AppSessionStore $sessions,
        private readonly SsoHttpClient $client,
    ) {}

    public function handle(?string $prompt = null): RedirectResponse
    {
        $transaction = $this->pkce->transaction();

        $this->sessions->storeTransaction($transaction);

        return redirect()->away($this->client->authorizeUrl(
            $transaction['state'],
            $transaction['code_challenge'],
            $transaction['nonce'],
            $prompt,
        ));
    }
}
