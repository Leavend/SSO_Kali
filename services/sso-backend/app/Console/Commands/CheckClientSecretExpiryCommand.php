<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\OidcClientRegistration;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * FR-009 / ISSUE-05: Proactive client secret expiry check.
 *
 * Scans all confidential clients and reports those with secrets
 * expiring within the configured threshold (default 14 days) or
 * already expired. Intended to run daily via scheduler.
 *
 * Exit codes:
 *   0 — all secrets healthy
 *   1 — one or more secrets expiring/expired (actionable warning)
 */
final class CheckClientSecretExpiryCommand extends Command
{
    protected $signature = 'sso:check-secret-expiry
        {--days=14 : Warning threshold in days before expiry}';

    protected $description = 'Check for client secrets approaching or past expiry (FR-009)';

    public function handle(): int
    {
        $thresholdDays = (int) $this->option('days');
        $threshold = Carbon::now()->addDays($thresholdDays);

        $clients = OidcClientRegistration::query()
            ->where('type', 'confidential')
            ->whereNotNull('secret_expires_at')
            ->where('secret_expires_at', '<=', $threshold)
            ->where('status', 'active')
            ->get(['client_id', 'display_name', 'owner_email', 'secret_expires_at', 'secret_rotated_at']);

        if ($clients->isEmpty()) {
            $this->info('✅ All client secrets are healthy. No expiry within '.$thresholdDays.' days.');

            return self::SUCCESS;
        }

        $this->warn('⚠️  '.$clients->count().' client(s) with expiring or expired secrets:');
        $this->newLine();

        $rows = $clients->map(function (OidcClientRegistration $client) {
            $expiresAt = Carbon::parse($client->secret_expires_at);
            $isExpired = $expiresAt->isPast();
            $daysLeft = $isExpired ? 0 : (int) now()->diffInDays($expiresAt);

            return [
                $client->client_id,
                $client->display_name,
                $client->owner_email,
                $isExpired ? 'EXPIRED' : $daysLeft.'d remaining',
                $expiresAt->toDateString(),
                $client->secret_rotated_at
                    ? Carbon::parse($client->secret_rotated_at)->toDateString()
                    : '—',
            ];
        })->all();

        $this->table(
            ['Client ID', 'Name', 'Owner', 'Status', 'Expires', 'Last Rotated'],
            $rows,
        );

        $this->newLine();
        $this->error('Action required: rotate secrets for the above clients.');

        return self::FAILURE;
    }
}
