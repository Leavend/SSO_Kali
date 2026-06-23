<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\EntitlementGuard;
use App\Services\Oidc\WidgetOriginPolicy;
use App\Services\Session\SsoSessionCookieFactory;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
    ) {}

    public function script(Request $request): Response
    {
        $backendUrl = rtrim((string) config('sso.base_url'), '/');
        $portalUrl = rtrim((string) config('sso.frontend_url', $backendUrl), '/');
        $jsonFlags = JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT;
        $backendUrlJs = json_encode($backendUrl, $jsonFlags);
        $portalUrlJs = json_encode($portalUrl, $jsonFlags);

        $js = <<<JS
(function() {
    // Inject Styles
    const style = document.createElement('style');
    style.textContent = `
        .sso-widget-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .sso-widget-trigger {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #4f46e5, #06b6d4);
            box-shadow: 0 4px 20px rgba(79, 70, 229, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            color: #ffffff;
            font-weight: 700;
            font-size: 20px;
            user-select: none;
        }
        .sso-widget-trigger:hover {
            transform: scale(1.05) translateY(-2px);
            box-shadow: 0 6px 24px rgba(79, 70, 229, 0.5);
        }
        .sso-widget-popover {
            position: absolute;
            bottom: 72px;
            right: 0;
            width: 320px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(229, 231, 235, 0.5);
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
            display: none;
            flex-direction: column;
            overflow: hidden;
            transition: all 0.2s ease-in-out;
            opacity: 0;
            transform: translateY(10px) scale(0.95);
            transform-origin: bottom right;
        }
        .sso-widget-popover.show {
            display: flex;
            opacity: 1;
            transform: translateY(0) scale(1);
        }
        .sso-widget-header {
            padding: 24px;
            text-align: center;
            border-bottom: 1px solid rgba(229, 231, 235, 0.5);
            background: linear-gradient(to bottom, rgba(79, 70, 229, 0.05), transparent);
        }
        .sso-widget-avatar-large {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #3b82f6);
            color: white;
            font-size: 24px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 12px;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }
        .sso-widget-name {
            font-weight: 600;
            color: #111827;
            font-size: 16px;
            margin-bottom: 4px;
        }
        .sso-widget-email {
            color: #6b7280;
            font-size: 13px;
        }
        .sso-widget-apps-section {
            padding: 16px;
            max-height: 200px;
            overflow-y: auto;
            border-bottom: 1px solid rgba(229, 231, 235, 0.5);
        }
        .sso-widget-apps-title {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #9ca3af;
            font-weight: 700;
            margin-bottom: 12px;
            padding-left: 4px;
        }
        .sso-widget-apps-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }
        .sso-widget-app-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-decoration: none;
            color: #374151;
            transition: all 0.2s ease;
            padding: 8px;
            border-radius: 8px;
        }
        .sso-widget-app-item:hover {
            background: rgba(79, 70, 229, 0.05);
            color: #4f46e5;
        }
        .sso-widget-app-icon {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            background: #f3f4f6;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 6px;
            border: 1px solid #e5e7eb;
        }
        .sso-widget-app-name {
            font-size: 11px;
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            width: 100%;
        }
        .sso-widget-footer {
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            background: #f9fafb;
            align-items: center;
        }
        .sso-widget-btn {
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            border: none;
        }
        .sso-widget-btn-secondary {
            background: white;
            color: #374151;
            border: 1px solid #d1d5db;
        }
        .sso-widget-btn-secondary:hover {
            background: #f3f4f6;
        }
        .sso-widget-btn-primary {
            background: #4f46e5;
            color: white;
        }
        .sso-widget-btn-primary:hover {
            background: #4338ca;
        }
        .sso-widget-btn-danger {
            background: #ef4444;
            color: white;
        }
        .sso-widget-btn-danger:hover {
            background: #dc2626;
        }
    \`;
    document.head.appendChild(style);

    const SSO_BACKEND_URL = {$backendUrlJs};
    const SSO_PORTAL_URL = {$portalUrlJs};

    // Create container
    const container = document.createElement('div');
    container.className = 'sso-widget-container';
    document.body.appendChild(container);

    const scriptTag = document.currentScript;
    const clientId = scriptTag ? scriptTag.getAttribute('data-client-id') : null;

    // Fetch active session
    fetch(SSO_BACKEND_URL + '/widget/session', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                renderAuthenticated(data.user);
            } else {
                renderUnauthenticated();
            }
        })
        .catch(() => {
            renderUnauthenticated();
        });

    function renderAuthenticated(user) {
        const initial = safeInitial(user.display_name, 'U');
        
        container.innerHTML = `
            <div class="sso-widget-trigger" id="sso-trigger">\${initial}</div>
            <div class="sso-widget-popover" id="sso-popover">
                <div class="sso-widget-header">
                    <div class="sso-widget-avatar-large">\${initial}</div>
                    <div class="sso-widget-name">\${escapeHtml(user.display_name)}</div>
                    <div class="sso-widget-email">\${escapeHtml(user.email)}</div>
                </div>
                <div class="sso-widget-apps-section">
                    <div class="sso-widget-apps-title">Aplikasi Anda</div>
                    <div class="sso-widget-apps-grid" id="sso-apps-grid">
                        <div style="grid-column: span 3; text-align: center; color: #9ca3af; font-size: 12px; padding: 12px;">Loading...</div>
                    </div>
                </div>
                <div class="sso-widget-footer">
                    <a href="\${SSO_PORTAL_URL}/profile" target="_blank" rel="noopener noreferrer" class="sso-widget-btn sso-widget-btn-secondary">Kelola Akun</a>
                    <button id="sso-logout-btn" class="sso-widget-btn sso-widget-btn-danger">Keluar</button>
                </div>
            </div>
        `;

        setupInteractions();
        loadApps();
    }

    function renderUnauthenticated() {
        container.innerHTML = `
            <div class="sso-widget-trigger" id="sso-trigger">🔑</div>
            <div class="sso-widget-popover" id="sso-popover">
                <div class="sso-widget-header" style="padding: 32px 24px;">
                    <div class="sso-widget-avatar-large" style="background: #f3f4f6; color: #4f46e5; border: 1px dashed #4f46e5;">🔑</div>
                    <div class="sso-widget-name">Gunakan Akun SSO</div>
                    <div class="sso-widget-email">Silakan masuk untuk mengakses aplikasi Anda.</div>
                </div>
                <div class="sso-widget-footer" style="justify-content: center; padding: 16px;">
                    <button id="sso-login-btn" class="sso-widget-btn sso-widget-btn-primary" style="width: 100%; padding: 10px 16px; font-size: 13px;">Masuk Sekarang</button>
                </div>
            </div>
        `;

        setupInteractions();

        const loginBtn = document.getElementById('sso-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                let authUrl = SSO_BACKEND_URL + '/authorize?client_id=' + encodeURIComponent(clientId || 'portal-bff') + '&response_type=code';
                window.location.href = authUrl;
            });
        }
    }

    function setupInteractions() {
        const trigger = document.getElementById('sso-trigger');
        const popover = document.getElementById('sso-popover');

        if (trigger && popover) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                popover.classList.toggle('show');
            });

            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    popover.classList.remove('show');
                }
            });
        }

        const logoutBtn = document.getElementById('sso-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                fetch(SSO_BACKEND_URL + '/widget/logout', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'X-SSO-Widget-Action': 'logout' }
                })
                    .then(() => {
                        window.location.reload();
                    })
                    .catch(() => {
                        window.location.reload();
                    });
            });
        }
    }

    function loadApps() {
        fetch(SSO_BACKEND_URL + '/widget/apps', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                const grid = document.getElementById('sso-apps-grid');
                if (!grid) return;
                
                const apps = data.apps || [];
                if (apps.length === 0) {
                    grid.innerHTML = '<div style="grid-column: span 3; text-align: center; color: #9ca3af; font-size: 12px; padding: 12px;">Tidak ada aplikasi yang tersedia.</div>';
                    return;
                }

                grid.innerHTML = '';
                apps.forEach(app => {
                    const appLetter = safeInitial(app.display_name, 'A');
                    const link = document.createElement('a');
                    link.className = 'sso-widget-app-item';
                    link.href = safeAppUrl(app.app_base_url);
                    link.title = app.display_name || '';

                    const icon = document.createElement('div');
                    icon.className = 'sso-widget-app-icon';
                    icon.textContent = appLetter;

                    const name = document.createElement('div');
                    name.className = 'sso-widget-app-name';
                    name.textContent = app.display_name || '';

                    link.appendChild(icon);
                    link.appendChild(name);
                    grid.appendChild(link);
                });
            })
            .catch(() => {
                const grid = document.getElementById('sso-apps-grid');
                if (grid) {
                    grid.innerHTML = '<div style="grid-column: span 3; text-align: center; color: #ef4444; font-size: 11px; padding: 12px;">Gagal memuat aplikasi.</div>';
                }
            });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
    }

    function safeAppUrl(value) {
        try {
            const url = new URL(value || '#', window.location.href);
            return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
        } catch (_) {
            return '#';
        }
    }

    function safeInitial(value, fallback) {
        const first = value ? String(value).charAt(0).toUpperCase() : fallback;
        return /^[A-Z0-9]$/.test(first) ? first : fallback;
    }
})();
JS;

        return response($js)
            ->header('Content-Type', 'application/javascript')
            ->header('Cache-Control', 'public, max-age=3600');
    }

    public function session(Request $request): JsonResponse
    {
        $sessionId = $this->cookies->resolve($request);
        $user = $this->sessions->currentUser($sessionId);

        if (! $user instanceof User) {
            return response()->json(['authenticated' => false]);
        }

        return response()->json([
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
        $currentSession = $currentSessionId !== null ? $this->sessions->current($currentSessionId) : null;

        if ($currentSession === null) {
            return response()->json(['accounts' => []], 401);
        }

        $user = User::query()->find($currentSession->user_id);
        if (! $user instanceof User) {
            return response()->json(['accounts' => []], 401);
        }

        return response()->json([
            'accounts' => [[
                'subject_id' => $user->subject_id,
                'display_name' => $user->display_name,
                'email' => $this->maskEmail($user->email),
                'status' => 'active',
            ]],
        ]);
    }

    public function apps(Request $request): JsonResponse
    {
        $sessionId = $this->cookies->resolve($request);
        $user = $this->sessions->currentUser($sessionId);

        if (! $user instanceof User) {
            return response()->json(['apps' => []]);
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

        return response()->json(['apps' => $apps]);
    }

    public function logout(Request $request): JsonResponse
    {
        if (! $this->isTrustedWidgetMutation($request)) {
            return response()->json(['success' => false, 'error' => 'forbidden'], 403);
        }

        $sessionId = $this->cookies->resolve($request);
        if (! $sessionId || $this->sessions->current($sessionId) === null) {
            return response()->json(['success' => false, 'error' => 'unauthenticated'], 401);
        }

        $this->sessions->revokeCurrent($sessionId);

        return response()->json(['success' => true])
            ->withCookie($this->cookieFactory->forget());
    }

    private function isTrustedWidgetMutation(Request $request): bool
    {
        $origin = $request->header('Origin');

        return $this->origins->allows($origin)
            && $request->header('X-SSO-Widget-Action') === 'logout';
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
}
