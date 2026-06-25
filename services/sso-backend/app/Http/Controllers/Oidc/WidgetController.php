<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Models\OidcClientRegistration;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DeviceSessionRegistry;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\EntitlementGuard;
use App\Services\Oidc\WidgetOriginPolicy;
use App\Services\Session\SsoSessionCookieFactory;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;

final class WidgetController
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionCookieFactory $cookieFactory,
        private readonly SsoSessionService $sessions,
        private readonly DownstreamClientRegistry $registry,
        private readonly EntitlementGuard $entitlements,
        private readonly WidgetOriginPolicy $origins,
        private readonly DeviceSessionRegistry $devices,
    ) {}

    public function script(Request $request): Response
    {
        $backendUrl = rtrim((string) config('sso.widget.public_base_url', config('sso.frontend_url', config('sso.base_url'))), '/');
        $portalUrl = rtrim((string) config('sso.frontend_url', $backendUrl), '/');
        $jsonFlags = JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT;
        $backendUrlJs = json_encode($backendUrl, $jsonFlags);
        $portalUrlJs = json_encode($portalUrl, $jsonFlags);

        $cssUrlJs = json_encode($backendUrl.'/widget/account.css', $jsonFlags);

        $js = <<<JS
(function() {
    const SSO_BACKEND_URL = {$backendUrlJs};
    const SSO_PORTAL_URL = {$portalUrlJs};
    const SSO_WIDGET_CSS_URL = {$cssUrlJs};
    const mounted = new WeakSet();

    function mount(target, options) {
        const host = resolveTarget(target, options && options.source);
        if (!host) return null;
        if (host.__ssoAccountWidget) return host.__ssoAccountWidget;
        if (mounted.has(host)) return null;
        mounted.add(host);

        const state = {
            clientId: (options && options.clientId) || 'portal-bff',
            features: featureSet((options && options.features) || 'apps,account'),
            opened: null
        };
        const shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
        const root = element('div', 'sso-account-widget');
        shadow.appendChild(stylesheet());
        shadow.appendChild(root);
        renderShell(root, state);
        loadSession(root, state);
        const controller = { refresh: function() { loadSession(root, state); } };
        host.__ssoAccountWidget = controller;
        return controller;
    }

    function resolveTarget(target, source) {
        if (typeof target === 'string' && target !== '') return document.querySelector(target);
        if (target && target.nodeType === 1) return target;
        const script = source || currentScript();
        const mountSelector = script ? script.getAttribute('data-mount') : null;
        if (mountSelector) {
            const mountTarget = document.querySelector(mountSelector);
            if (mountTarget) return mountTarget;
        }
        const placeholder = element('span', 'sso-account-widget-host');
        if (script && script.parentNode) {
            script.parentNode.insertBefore(placeholder, script);
            return placeholder;
        }
        document.body.appendChild(placeholder);
        return placeholder;
    }

    function currentScript() {
        return document.currentScript ||
            document.querySelector('script[data-sso-widget]') ||
            document.querySelector('script[src*="/widget/account.js"]');
    }

    function optionsFromScript(script) {
        return {
            source: script,
            clientId: script ? script.getAttribute('data-client-id') : null,
            features: script ? script.getAttribute('data-features') : null
        };
    }

    function featureSet(value) {
        return String(value || '').split(',').map(function(item) { return item.trim(); });
    }

    function stylesheet() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = SSO_WIDGET_CSS_URL;
        return link;
    }

    function renderShell(root, state) {
        clear(root);
        const bar = element('div', 'sso-widget-bar');
        if (state.features.indexOf('apps') !== -1) {
            bar.appendChild(trigger('apps', 'Aplikasi SSO', waffleIcon()));
            bar.appendChild(popover('apps', 'Aplikasi'));
        }
        if (state.features.indexOf('account') !== -1) {
            bar.appendChild(trigger('account', 'Akun SSO', textNode('U')));
            bar.appendChild(popover('account', 'Akun'));
        }
        root.appendChild(bar);
        root.addEventListener('click', function(event) { handleClick(event, root, state); });
        document.addEventListener('click', function(event) {
            if (!root.contains(event.target)) closeAll(root, state);
        });
        root.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') closeAll(root, state);
        });
    }

    function trigger(name, label, child) {
        const button = element('button', 'sso-widget-trigger');
        button.type = 'button';
        button.dataset.trigger = name;
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', label);
        button.appendChild(child);
        return button;
    }

    function popover(name, title) {
        const menu = element('section', 'sso-widget-popover');
        menu.dataset.popover = name;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', title);
        menu.hidden = true;
        return menu;
    }

    function handleClick(event, root, state) {
        const target = event.target;
        const button = target && target.closest ? target.closest('[data-trigger]') : null;
        if (button) {
            event.stopPropagation();
            toggle(root, state, button.dataset.trigger);
            return;
        }
        const logout = target && target.closest ? target.closest('[data-widget-logout]') : null;
        if (logout) void logoutSession();
        const account = target && target.closest ? target.closest('[data-account-id]') : null;
        if (account) void switchAccount(account.getAttribute('data-account-id'));
    }

    function toggle(root, state, name) {
        state.opened = state.opened === name ? null : name;
        root.querySelectorAll('[data-popover]').forEach(function(menu) {
            menu.hidden = menu.dataset.popover !== state.opened;
        });
        root.querySelectorAll('[data-trigger]').forEach(function(button) {
            button.setAttribute('aria-expanded', button.dataset.trigger === state.opened ? 'true' : 'false');
        });
    }

    function closeAll(root, state) {
        state.opened = null;
        root.querySelectorAll('[data-popover]').forEach(function(menu) { menu.hidden = true; });
        root.querySelectorAll('[data-trigger]').forEach(function(button) { button.setAttribute('aria-expanded', 'false'); });
    }

    function loadSession(root, state) {
        fetch(SSO_BACKEND_URL + '/widget/session', { credentials: 'include' })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.authenticated) renderAuthenticated(root, state, data.user);
                else renderGuest(root, state);
            })
            .catch(function() { renderGuest(root, state); });
    }

    function renderAuthenticated(root, state, user) {
        const accountButton = root.querySelector('[data-trigger="account"]');
        if (accountButton) accountButton.textContent = safeInitial(user && user.display_name, 'U');
        renderApps(root);
        renderAccount(root, user);
    }

    function renderGuest(root, state) {
        const accountButton = root.querySelector('[data-trigger="account"]');
        if (accountButton) accountButton.textContent = 'SSO';
        const menu = root.querySelector('[data-popover="account"]');
        if (!menu) return;
        clear(menu);
        menu.appendChild(line('Gunakan Akun SSO', 'Silakan masuk untuk mengakses aplikasi Anda.'));
        const login = element('button', 'sso-widget-action sso-widget-action-primary');
        login.type = 'button';
        login.textContent = 'Masuk';
        login.addEventListener('click', function() {
            window.location.href = SSO_BACKEND_URL + '/authorize?client_id=' + encodeURIComponent(state.clientId) + '&response_type=code';
        });
        menu.appendChild(login);
    }

    function renderApps(root) {
        const menu = root.querySelector('[data-popover="apps"]');
        if (!menu) return;
        clear(menu);
        menu.appendChild(statusText('Memuat aplikasi...'));
        fetch(SSO_BACKEND_URL + '/widget/apps', { credentials: 'include' })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                clear(menu);
                const apps = Array.isArray(data.apps) ? data.apps : [];
                if (apps.length === 0) {
                    menu.appendChild(statusText('Tidak ada aplikasi yang tersedia.'));
                    return;
                }
                const grid = element('div', 'sso-widget-app-grid');
                apps.forEach(function(app) {
                    const href = safeAppUrl(app.app_base_url);
                    if (!href) return;
                    const link = element('a', 'sso-widget-app-item');
                    link.href = href;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.appendChild(badge(safeInitial(app.display_name, 'A')));
                    link.appendChild(textSpan(app.display_name || 'Aplikasi'));
                    grid.appendChild(link);
                });
                menu.appendChild(grid.childElementCount > 0 ? grid : statusText('Tidak ada aplikasi yang tersedia.'));
            })
            .catch(function() {
                clear(menu);
                menu.appendChild(statusText('Gagal memuat aplikasi.'));
            });
    }

    function renderAccount(root, user) {
        const menu = root.querySelector('[data-popover="account"]');
        if (!menu) return;
        clear(menu);
        menu.appendChild(line(user.display_name || 'Akun SSO', user.email || ''));
        const profile = element('a', 'sso-widget-action');
        profile.href = SSO_PORTAL_URL + '/profile';
        profile.target = '_blank';
        profile.rel = 'noopener noreferrer';
        profile.textContent = 'Kelola Akun';
        menu.appendChild(profile);
        const accounts = element('div', 'sso-widget-account-list');
        accounts.appendChild(statusText('Memuat akun...'));
        menu.appendChild(accounts);
        const logout = element('button', 'sso-widget-action sso-widget-action-danger');
        logout.type = 'button';
        logout.dataset.widgetLogout = 'true';
        logout.textContent = 'Keluar';
        menu.appendChild(logout);
        loadAccounts(accounts);
    }

    function loadAccounts(container) {
        fetch(SSO_BACKEND_URL + '/widget/accounts', { credentials: 'include' })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                clear(container);
                const accounts = Array.isArray(data.accounts) ? data.accounts : [];
                if (accounts.length <= 1) return;
                container.appendChild(statusText('Tampilkan akun lainnya'));
                accounts.forEach(function(account) {
                    if (account.is_current || !account.account_id) return;
                    const button = element('button', 'sso-widget-account');
                    button.type = 'button';
                    button.dataset.accountId = account.account_id;
                    button.appendChild(line(account.display_name || 'Akun SSO', (account.email || '') + ' · ' + (account.status || '')));
                    container.appendChild(button);
                });
            })
            .catch(function() {
                clear(container);
                container.appendChild(statusText('Gagal memuat akun.'));
            });
    }

    function switchAccount(accountId) {
        if (!accountId) return Promise.resolve();
        return fetch(SSO_BACKEND_URL + '/widget/switch', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-SSO-Widget-Action': 'switch' },
            body: JSON.stringify({ account_id: accountId })
        }).then(function(response) {
            return response.json().catch(function() { return {}; }).then(function(payload) {
                if (response.ok) {
                    window.location.reload();
                    return;
                }
                const loginUrl = payload && safeAbsoluteUrl(payload.login_url);
                if (loginUrl) {
                    window.location.href = loginUrl;
                    return;
                }
                throw new Error('sso_widget_switch_failed');
            });
        }).catch(function() {});
    }

    function logoutSession() {
        return fetch(SSO_BACKEND_URL + '/widget/logout', {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-SSO-Widget-Action': 'logout' }
        }).then(function() { window.location.reload(); })
          .catch(function() { window.location.reload(); });
    }

    function element(tag, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    function clear(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    function line(title, subtitle) {
        const row = element('div', 'sso-widget-line');
        const strong = element('strong', '');
        strong.textContent = title || '';
        const span = element('span', '');
        span.textContent = subtitle || '';
        row.appendChild(strong);
        row.appendChild(span);
        return row;
    }

    function statusText(value) {
        const node = element('p', 'sso-widget-status');
        node.textContent = value;
        return node;
    }

    function badge(value) {
        const node = element('span', 'sso-widget-badge');
        node.textContent = value;
        return node;
    }

    function textSpan(value) {
        const node = element('span', '');
        node.textContent = value;
        return node;
    }

    function textNode(value) {
        return document.createTextNode(value);
    }

    function safeAppUrl(value) {
        return safeAbsoluteUrl(value);
    }

    function safeAbsoluteUrl(value) {
        if (!value || typeof value !== 'string') return null;
        try {
            const url = new URL(value);
            return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
        } catch (_) {
            return null;
        }
    }

    function safeInitial(value, fallback) {
        const first = value ? String(value).charAt(0).toUpperCase() : fallback;
        return /^[A-Z0-9]$/.test(first) ? first : fallback;
    }

    function waffleIcon() {
        const icon = element('span', 'sso-widget-waffle');
        for (let i = 0; i < 9; i += 1) icon.appendChild(element('i', ''));
        return icon;
    }

    window.SSOAccount = window.SSOAccount || {};
    window.SSOAccount.mount = mount;

    const script = currentScript();
    mount(null, optionsFromScript(script));
})();
JS;

        return response($js)
            ->header('Content-Type', 'application/javascript')
            // Request-independent, byte-identical for every visitor: safe for shared
            // (CDN/proxy) caching. Credentialed session/data endpoints stay no-store.
            ->header('Cache-Control', 'public, max-age=3600');
    }

    public function css(): Response
    {
        $css = <<<'CSS'
:host {
    color-scheme: light;
}

.sso-account-widget {
    display: inline-flex;
    position: relative;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.sso-widget-bar {
    align-items: center;
    display: inline-flex;
    gap: 8px;
    position: relative;
}

.sso-widget-trigger {
    align-items: center;
    background: #ffffff;
    border: 1px solid #d8dee8;
    border-radius: 999px;
    color: #1f2937;
    cursor: pointer;
    display: inline-flex;
    font-size: 12px;
    font-weight: 700;
    height: 40px;
    justify-content: center;
    min-width: 40px;
    padding: 0 12px;
}

.sso-widget-trigger:focus-visible,
.sso-widget-action:focus-visible,
.sso-widget-account:focus-visible,
.sso-widget-app-item:focus-visible {
    outline: 3px solid rgba(79, 70, 229, 0.28);
    outline-offset: 2px;
}

.sso-widget-waffle {
    display: grid;
    gap: 3px;
    grid-template-columns: repeat(3, 4px);
}

.sso-widget-waffle i {
    background: currentColor;
    border-radius: 999px;
    display: block;
    height: 4px;
    width: 4px;
}

.sso-widget-popover {
    background: #ffffff;
    border: 1px solid #d8dee8;
    border-radius: 14px;
    box-shadow: 0 20px 48px rgba(15, 23, 42, 0.18);
    display: grid;
    gap: 10px;
    min-width: 288px;
    padding: 14px;
    position: absolute;
    right: 0;
    top: calc(100% + 10px);
    z-index: 2147483647;
}

.sso-widget-popover[hidden] {
    display: none;
}

.sso-widget-line {
    display: grid;
    gap: 2px;
    min-width: 0;
}

.sso-widget-line strong,
.sso-widget-line span,
.sso-widget-status,
.sso-widget-app-item span {
    overflow-wrap: anywhere;
}

.sso-widget-line strong {
    color: #111827;
    font-size: 14px;
}

.sso-widget-line span,
.sso-widget-status {
    color: #64748b;
    font-size: 12px;
}

.sso-widget-app-grid {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.sso-widget-app-item,
.sso-widget-account,
.sso-widget-action {
    border-radius: 10px;
    color: #1f2937;
    text-decoration: none;
}

.sso-widget-app-item {
    align-items: center;
    display: grid;
    gap: 6px;
    justify-items: center;
    padding: 8px;
    text-align: center;
}

.sso-widget-badge {
    align-items: center;
    background: #eef2ff;
    border-radius: 10px;
    color: #4338ca;
    display: inline-flex;
    font-size: 13px;
    font-weight: 700;
    height: 36px;
    justify-content: center;
    width: 36px;
}

.sso-widget-action,
.sso-widget-account {
    background: #f8fafc;
    border: 1px solid transparent;
    cursor: pointer;
    display: block;
    font: inherit;
    padding: 10px 12px;
    text-align: left;
    width: 100%;
}

.sso-widget-action-primary {
    background: #4f46e5;
    color: #ffffff;
    text-align: center;
}

.sso-widget-action-danger {
    color: #b91c1c;
}

.sso-widget-app-item:hover,
.sso-widget-action:hover,
.sso-widget-account:hover {
    background: #eef2ff;
}

.sso-widget-account-list:empty {
    display: none;
}
CSS;

        return response($css)
            ->header('Content-Type', 'text/css; charset=UTF-8')
            // Request-independent static asset: safe for shared (CDN/proxy) caching.
            ->header('Cache-Control', 'public, max-age=3600');
    }

    public function session(Request $request): JsonResponse
    {
        $sessionId = $this->cookies->resolve($request);
        $user = $this->sessions->peekActiveUser($sessionId);

        if (! $user instanceof User) {
            return $this->noStore(['authenticated' => false]);
        }

        return $this->noStore([
            'authenticated' => true,
            'user' => [
                'subject_id' => $user->subject_id,
                'display_name' => $user->display_name,
                'email' => $this->maskEmail($user->email),
            ],
        ]);
    }

    public function accounts(Request $request): JsonResponse
    {
        $currentSessionId = $this->cookies->resolve($request);
        $currentSession = $currentSessionId !== null ? $this->sessions->peekActive($currentSessionId) : null;

        if ($currentSession === null) {
            return $this->noStore(['accounts' => []], 401);
        }

        return $this->noStore([
            'accounts' => $this->devices->accounts(
                $request,
                $currentSession,
                fn (string $email): string => $this->maskEmail($email),
            ),
        ]);
    }

    public function apps(Request $request): JsonResponse
    {
        $sessionId = $this->cookies->resolve($request);
        $user = $this->sessions->peekActiveUser($sessionId);

        if (! $user instanceof User) {
            return $this->noStore(['apps' => []]);
        }

        // Fetch dynamic registrations
        $registrations = OidcClientRegistration::query()->where('status', 'active')->get();
        $clientIds = $registrations->pluck('client_id')->all();

        // Fetch config registrations
        $configClients = config('oidc_clients.clients', []);
        foreach (array_keys($configClients) as $clientId) {
            if (is_string($clientId) && ! in_array($clientId, $clientIds, true)) {
                $clientIds[] = $clientId;
            }
        }

        $apps = [];
        foreach ($clientIds as $id) {
            $client = $this->registry->find($id);
            if ($client && $this->entitlements->allows($user, $client)) {
                // Find display name and base url from registration or fallback config
                $displayName = ucwords(str_replace('-', ' ', $id));
                $appBaseUrl = '';

                $reg = $registrations->firstWhere('client_id', $id);
                if ($reg) {
                    $displayName = $reg->display_name ?: $displayName;
                    $appBaseUrl = $this->webUrl($reg->app_base_url) ?? $appBaseUrl;
                } elseif (isset($configClients[$id])) {
                    $c = $configClients[$id];
                    $displayName = $c['display_name'] ?? $displayName;
                    $appBaseUrl = $this->webUrl($c['app_base_url'] ?? null) ?? $appBaseUrl;
                }

                $apps[] = [
                    'client_id' => $id,
                    'display_name' => $displayName,
                    'app_base_url' => $appBaseUrl,
                    'category' => $client->category,
                ];
            }
        }

        return $this->noStore(['apps' => $apps]);
    }

    public function switch(Request $request): JsonResponse
    {
        if (! $this->isTrustedWidgetMutation($request, 'switch')) {
            return $this->noStore(['success' => false, 'error' => 'forbidden'], 403);
        }

        $currentSessionId = $this->cookies->resolve($request);
        $currentSession = $currentSessionId !== null ? $this->sessions->peekActive($currentSessionId) : null;

        if (! $currentSession instanceof SsoSession) {
            return $this->noStore(['success' => false, 'error' => 'unauthenticated'], 401);
        }

        $accountId = $request->string('account_id')->toString();
        $session = $this->devices->switch($request, $currentSession, $accountId);

        if (! $session instanceof SsoSession) {
            return $this->noStore([
                'success' => false,
                'error' => 'session_expired',
                'login_url' => rtrim((string) config('sso.login_url', config('sso.frontend_url').'/login'), '/'),
            ], 409);
        }

        $response = $this->noStore(['success' => true]);
        $response->withCookie($this->cookieFactory->make($session->session_id));
        $deviceCookie = $this->devices->cookieForRequest($request);
        if ($deviceCookie instanceof Cookie) {
            $response->withCookie($deviceCookie);
        }

        return $response;
    }

    public function logout(Request $request): JsonResponse
    {
        if (! $this->isTrustedWidgetMutation($request, 'logout')) {
            return $this->noStore(['success' => false, 'error' => 'forbidden'], 403);
        }

        $sessionId = $this->cookies->resolve($request);
        if (! $sessionId || $this->sessions->peekActive($sessionId) === null) {
            return $this->noStore(['success' => false, 'error' => 'unauthenticated'], 401);
        }

        $this->devices->forgetSession($sessionId);
        $this->sessions->revokeCurrent($sessionId);

        return $this->noStore(['success' => true])
            ->withCookie($this->cookieFactory->forget());
    }

    private function isTrustedWidgetMutation(Request $request, string $action): bool
    {
        $origin = $request->header('Origin');

        return $this->origins->allows($origin)
            && $request->header('X-SSO-Widget-Action') === $action;
    }

    private function webUrl(mixed $value): ?string
    {
        return is_string($value) ? $this->origins->origin($value) : null;
    }

    private function maskEmail(string $email): string
    {
        $parts = explode('@', $email);
        if (count($parts) !== 2) {
            return $email;
        }
        [$local, $domain] = $parts;
        $len = strlen($local);
        if ($len <= 2) {
            return $local.'@'.$domain;
        }

        return $local[0].str_repeat('*', $len - 2).$local[$len - 1].'@'.$domain;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function noStore(array $payload, int $status = 200): JsonResponse
    {
        return response()->json($payload, $status)
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            ->header('Pragma', 'no-cache');
    }
}
