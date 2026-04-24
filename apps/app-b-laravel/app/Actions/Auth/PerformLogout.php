<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Services\Sso\AppSessionStore;
use App\Services\Sso\SsoHttpClient;
use Illuminate\Http\RedirectResponse;
use Throwable;

final class PerformLogout
{
    public function __construct(
        private readonly AppSessionStore $sessions,
        private readonly SsoHttpClient $client,
    ) {}

    public function handle(): RedirectResponse
    {
        $session = $this->sessions->current();

        try {
            is_array($session) && $this->client->logout((string) $session['access_token']);
        } catch (Throwable) {
        }

        $this->sessions->clearCurrent();

        return redirect('/')->with('status', 'Logout terpusat selesai untuk App B.');
    }
}
