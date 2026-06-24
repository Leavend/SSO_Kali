<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\DeviceSession;
use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Cookie;

final class DeviceSessionRegistry
{
    private const int DEVICE_ID_LENGTH = 48;

    private const int ACCOUNT_ID_LENGTH = 40;

    private bool $missingHashKeyWarningLogged = false;

    public function bind(Request $request, SsoSession $session): ?Cookie
    {
        $deviceId = $this->deviceId($request) ?? $this->newDeviceId();
        $deviceHash = $this->hash($deviceId);
        if ($deviceHash === null) {
            $this->logMissingHashKey();

            return null;
        }

        $now = now();

        DB::transaction(function () use ($deviceHash, $session, $now): void {
            DeviceSession::query()->upsert(
                [[
                    'device_hash' => $deviceHash,
                    'session_id' => $session->session_id,
                    'user_id' => $session->user_id,
                    'account_id' => $this->accountId($deviceHash, $session->session_id),
                    'added_at' => $now,
                    'last_seen_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]],
                ['device_hash', 'session_id'],
                [
                    'user_id',
                    'last_seen_at',
                    'updated_at',
                ],
            );

            $this->pruneOverflow($deviceHash);
        });

        return $this->cookie($deviceId);
    }

    public function bindSessionId(Request $request, string $sessionId): ?Cookie
    {
        $session = SsoSession::query()
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->first();

        return $session instanceof SsoSession ? $this->bind($request, $session) : null;
    }

    /**
     * @return list<array{account_id: string|null, subject_id: string, display_name: string, email: string, status: string, is_current: bool}>
     */
    public function accounts(Request $request, ?SsoSession $currentSession, callable $maskEmail): array
    {
        if (! $currentSession instanceof SsoSession) {
            return [];
        }

        $deviceId = $this->deviceId($request);
        if ($deviceId === null) {
            return $this->currentOnly($currentSession, $maskEmail);
        }

        $deviceHash = $this->hash($deviceId);
        if ($deviceHash === null) {
            return $this->currentOnly($currentSession, $maskEmail);
        }

        if (! $this->hasActiveBinding($deviceHash, $currentSession->session_id)) {
            return $this->currentOnly($currentSession, $maskEmail);
        }

        $this->touchCurrent($deviceHash, $currentSession);

        $rows = DB::table('device_sessions as d')
            ->join('sso_sessions as s', 's.session_id', '=', 'd.session_id')
            ->join('users as u', 'u.id', '=', 'd.user_id')
            ->where('d.device_hash', $deviceHash)
            ->orderByRaw('CASE WHEN s.session_id = ? THEN 0 ELSE 1 END', [$currentSession->session_id])
            ->orderByDesc('d.last_seen_at')
            ->select([
                'd.account_id',
                'd.session_id',
                'u.subject_id',
                'u.display_name',
                'u.email',
                's.revoked_at',
                's.expires_at',
            ])
            ->selectRaw('CASE WHEN s.revoked_at IS NULL AND s.expires_at > ? THEN 1 ELSE 0 END as is_active', [now()])
            ->get();

        return $rows
            ->map(fn (object $row): array => [
                'account_id' => (string) $row->account_id,
                'subject_id' => (string) $row->subject_id,
                'display_name' => (string) $row->display_name,
                'email' => $maskEmail((string) $row->email),
                'status' => ((int) $row->is_active) === 1 ? 'active' : 'session_expired',
                'is_current' => (string) $row->session_id === $currentSession->session_id,
            ])
            ->values()
            ->all();
    }

    public function switch(Request $request, SsoSession $currentSession, string $accountId): ?SsoSession
    {
        $deviceId = $this->deviceId($request);
        if ($deviceId === null || $accountId === '') {
            return null;
        }

        $deviceHash = $this->hash($deviceId);
        if ($deviceHash === null) {
            return null;
        }

        if (! $this->hasActiveBinding($deviceHash, $currentSession->session_id)) {
            return null;
        }

        $row = DeviceSession::query()
            ->where('device_hash', $deviceHash)
            ->where('account_id', $accountId)
            ->first();

        if (! $row instanceof DeviceSession) {
            return null;
        }

        $session = SsoSession::query()
            ->where('session_id', $row->session_id)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->first();

        if (! $session instanceof SsoSession) {
            return null;
        }

        $row->forceFill(['last_seen_at' => now()])->save();

        return $session;
    }

    public function forgetSession(string $sessionId): void
    {
        DeviceSession::query()->where('session_id', $sessionId)->delete();
    }

    public function pruneExpiredAndRevoked(): int
    {
        $deleted = 0;

        do {
            /** @var Collection<int, int> $ids */
            $ids = DB::table('device_sessions')
                ->leftJoin('sso_sessions', 'sso_sessions.session_id', '=', 'device_sessions.session_id')
                ->where(function ($query): void {
                    $query
                        ->whereNull('sso_sessions.session_id')
                        ->orWhereNotNull('sso_sessions.revoked_at')
                        ->orWhere('sso_sessions.expires_at', '<=', now());
                })
                ->orderBy('device_sessions.id')
                ->limit(1000)
                ->pluck('device_sessions.id');

            if ($ids->isEmpty()) {
                break;
            }

            $deleted += DeviceSession::query()->whereIn('id', $ids->all())->delete();
        } while ($ids->count() === 1000);

        return $deleted;
    }

    public function cookieForRequest(Request $request): ?Cookie
    {
        $deviceId = $this->deviceId($request);

        return $deviceId === null ? null : $this->cookie($deviceId);
    }

    public function cookieName(): string
    {
        return (string) config('sso.widget.device_cookie', '__Host-sso_device');
    }

    private function deviceId(Request $request): ?string
    {
        $value = $request->cookies->get($this->cookieName());

        return is_string($value) && $this->isDeviceId($value) ? $value : null;
    }

    private function isDeviceId(string $value): bool
    {
        return preg_match('/^[A-Za-z0-9]{40,80}$/', $value) === 1;
    }

    private function newDeviceId(): string
    {
        return Str::random(self::DEVICE_ID_LENGTH);
    }

    private function hash(string $deviceId): ?string
    {
        $key = (string) config('sso.widget.device_hash_key', '');
        if (trim($key) === '') {
            return null;
        }

        return hash_hmac('sha256', $deviceId, $key);
    }

    private function logMissingHashKey(): void
    {
        if ($this->missingHashKeyWarningLogged) {
            return;
        }

        $this->missingHashKeyWarningLogged = true;

        $key = 'sso_widget_device_hash_key_missing_warning';
        if (Cache::add($key, true, now()->addMinute())) {
            Log::warning('SSO widget device hash key is not configured; device-bound account chooser was skipped.');
        }
    }

    private function accountId(string $deviceHash, string $sessionId): string
    {
        $existing = DeviceSession::query()
            ->where('device_hash', $deviceHash)
            ->where('session_id', $sessionId)
            ->value('account_id');

        return is_string($existing) && $existing !== '' ? $existing : Str::random(self::ACCOUNT_ID_LENGTH);
    }

    private function cookie(string $deviceId): Cookie
    {
        return cookie(
            name: $this->cookieName(),
            value: $deviceId,
            minutes: (int) config('sso.widget.device_cookie_minutes', 576000),
            path: '/',
            domain: null,
            secure: true,
            httpOnly: true,
            raw: false,
            sameSite: (string) config('sso.widget.device_cookie_same_site', 'none'),
        );
    }

    /**
     * @return list<array{account_id: null, subject_id: string, display_name: string, email: string, status: string, is_current: true}>
     */
    private function currentOnly(SsoSession $session, callable $maskEmail): array
    {
        $user = User::query()->find($session->user_id);
        if (! $user instanceof User) {
            return [];
        }

        return [[
            'account_id' => null,
            'subject_id' => $user->subject_id,
            'display_name' => $user->display_name,
            'email' => $maskEmail($user->email),
            'status' => 'active',
            'is_current' => true,
        ]];
    }

    private function touchCurrent(string $deviceHash, SsoSession $session): void
    {
        DeviceSession::query()
            ->where('device_hash', $deviceHash)
            ->where('session_id', $session->session_id)
            ->update(['last_seen_at' => now(), 'updated_at' => now()]);
    }

    private function pruneOverflow(string $deviceHash): void
    {
        $limit = max(1, (int) config('sso.widget.max_accounts_per_device', 8));
        $ids = DeviceSession::query()
            ->where('device_hash', $deviceHash)
            ->orderByDesc('last_seen_at')
            ->orderByDesc('id')
            ->pluck('id');

        /** @var Collection<int, int> $overflow */
        $overflow = $ids->slice($limit)->values();
        if ($overflow->isEmpty()) {
            return;
        }

        DeviceSession::query()->whereIn('id', $overflow->all())->delete();
    }

    private function hasActiveBinding(string $deviceHash, string $sessionId): bool
    {
        return DB::table('device_sessions as d')
            ->join('sso_sessions as s', 's.session_id', '=', 'd.session_id')
            ->where('d.device_hash', $deviceHash)
            ->where('d.session_id', $sessionId)
            ->whereNull('s.revoked_at')
            ->where('s.expires_at', '>', now())
            ->exists();
    }
}
