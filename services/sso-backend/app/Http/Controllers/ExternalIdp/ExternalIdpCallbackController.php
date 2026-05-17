<?php

declare(strict_types=1);

namespace App\Http\Controllers\ExternalIdp;

use App\Actions\ExternalIdp\CompleteExternalIdpCallbackAction;
use App\Http\Requests\ExternalIdp\ExternalIdpCallbackRequest;
use App\Services\Session\SsoSessionCookieFactory;
use Illuminate\Http\RedirectResponse;

final class ExternalIdpCallbackController
{
    public function __invoke(
        ExternalIdpCallbackRequest $request,
        CompleteExternalIdpCallbackAction $callback,
        SsoSessionCookieFactory $cookies,
    ): RedirectResponse {
        $result = $callback->execute($request);

        if ($result['ok'] !== true) {
            return $this->loginFallback($result['error'] ?? 'external_idp_callback_failed');
        }

        $redirect = new RedirectResponse($this->frontendUrl($result['return_to'] ?? '/home'), 302, [
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);

        return $redirect->withCookie($cookies->make((string) $result['session_id']));
    }

    private function frontendUrl(string $path): string
    {
        $base = rtrim((string) config('sso.frontend_url'), '/');
        $safePath = $path !== '' && str_starts_with($path, '/') && ! str_starts_with($path, '//')
            ? $path
            : '/home';

        return $base.$safePath;
    }

    private function loginFallback(string $reason): RedirectResponse
    {
        $base = rtrim((string) config('sso.login_url', config('sso.frontend_url').'/login'), '/');
        $url = $base.'?'.http_build_query(['error' => $reason]);

        return new RedirectResponse($url, 302, [
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }
}
