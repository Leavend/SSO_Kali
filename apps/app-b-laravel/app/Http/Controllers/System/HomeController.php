<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use App\Services\Sso\AppSessionStore;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class HomeController
{
    /** @var array<string, string> */
    private const STATUS_MESSAGES = [
        'expired-state' => 'State login tidak valid atau sudah kedaluwarsa.',
        'handshake-failed' => 'Handshake SSO gagal diselesaikan.',
        'session-expired' => 'Sesi lokal berakhir atau refresh token tidak valid. Silakan login ulang.',
        'signed-out' => 'Logout terpusat selesai untuk App B.',
        'sso-miss' => 'Sesi SSO pusat tidak tersedia. Silakan login manual.',
    ];

    public function __invoke(Request $request, AppSessionStore $sessions): View|RedirectResponse
    {
        $event = $this->event($request);

        if ($event !== null) {
            $sessions->clearCurrent();
        }

        if ($sessions->current() !== null) {
            return redirect('/dashboard');
        }

        // Touchless SSO: if no local session and not yet attempted silent check,
        // auto-redirect to broker with prompt=none to check for existing ZITADEL session.
        if ($this->shouldAttemptSilentSso($request, $event)) {
            return redirect('/auth/login?prompt=none');
        }

        return view('home', [
            'clientId' => config('services.sso.client_id'),
            'issuer' => config('services.sso.public_issuer'),
            'callbackUri' => config('services.sso.redirect_uri'),
            'statusMessage' => $event === null ? null : self::STATUS_MESSAGES[$event],
        ]);
    }

    private function event(Request $request): ?string
    {
        $event = (string) $request->query('event', '');

        return array_key_exists($event, self::STATUS_MESSAGES) ? $event : null;
    }

    private function shouldAttemptSilentSso(Request $request, ?string $event): bool
    {
        return $event === null
            && $request->query('sso_checked') !== '1'
            && ! $request->session()->has('status');
    }
}
