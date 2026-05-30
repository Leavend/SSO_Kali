<?php

declare(strict_types=1);

namespace App\Services\Profile;

use App\Models\TrustedDevice;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class TrustedDevicesService
{
    /**
     * @return list<array<string, mixed>>
     */
    public function listForSubject(string $subjectId): array
    {
        return TrustedDevice::query()
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->orderByDesc('last_seen_at')
            ->orderByDesc('trusted_at')
            ->get()
            ->map(fn (TrustedDevice $device): array => $this->present($device))
            ->all();
    }

    public function remember(int $userId, string $subjectId, ?string $ipAddress, ?string $userAgent): TrustedDevice
    {
        $fingerprint = $this->fingerprint($subjectId, $userAgent);
        $now = now();

        $device = TrustedDevice::query()->firstOrNew([
            'subject_id' => $subjectId,
            'fingerprint' => $fingerprint,
        ]);

        $device->forceFill([
            'user_id' => $userId,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'trusted_at' => $device->exists ? $device->trusted_at : $now,
            'last_seen_at' => $now,
            'revoked_at' => null,
        ])->save();

        return $device;
    }

    public function rename(string $subjectId, int $deviceId, string $label): ?TrustedDevice
    {
        $device = $this->activeForSubject($subjectId, $deviceId);
        if (! $device instanceof TrustedDevice) {
            return null;
        }

        $device->forceFill(['label' => Str::of($label)->trim()->limit(80, '')->toString()])->save();

        return $device;
    }

    public function revoke(string $subjectId, int $deviceId): bool
    {
        return DB::transaction(function () use ($subjectId, $deviceId): bool {
            $device = $this->activeForSubject($subjectId, $deviceId);
            if (! $device instanceof TrustedDevice) {
                return false;
            }

            $device->forceFill(['revoked_at' => now()])->save();

            DB::table('sso_sessions')
                ->where('trusted_device_id', $device->id)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now(), 'updated_at' => now()]);

            return true;
        });
    }

    private function activeForSubject(string $subjectId, int $deviceId): ?TrustedDevice
    {
        $device = TrustedDevice::query()
            ->whereKey($deviceId)
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->first();

        return $device instanceof TrustedDevice ? $device : null;
    }

    private function fingerprint(string $subjectId, ?string $userAgent): string
    {
        return hash('sha256', $subjectId.'|'.($userAgent ?? 'unknown-device'));
    }

    /**
     * @return array<string, mixed>
     */
    private function present(TrustedDevice $device): array
    {
        return [
            'id' => $device->id,
            'label' => $device->label,
            'fingerprint' => substr($device->fingerprint, 0, 12),
            'trusted_at' => $this->iso($device->trusted_at),
            'last_seen_at' => $this->iso($device->last_seen_at),
            'ip_address' => $device->ip_address,
            'user_agent' => $device->user_agent,
        ];
    }

    private function iso(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return str_replace(' ', 'T', (string) $value).'Z';
    }
}
