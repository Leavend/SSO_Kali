<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * Artisan command for rotating OIDC signing keys (FR-002 / UC-64 / UC-80).
 *
 * Procedure:
 *   1. Backup current private + public keys with timestamp suffix.
 *   2. Generate new EC P-256 keypair.
 *   3. Write new keys to configured paths.
 *   4. Update kid via output instruction (operator must set env).
 *
 * Live tokens signed with the old key remain valid until their natural exp —
 * they won't verify via JWKS after rotation, so this is a breaking change
 * for unexpired tokens. Use only during planned maintenance or incident
 * response (emergency credential reset).
 */
final class RotateSigningKeysCommand extends Command
{
    /** @var string */
    protected $signature = 'sso:keys:rotate
                            {--force : Skip the confirmation prompt}
                            {--new-kid= : The new kid to assign (default: sso-{env}-{YYYYMMDDHHmm})}';

    /** @var string */
    protected $description = 'Rotate OIDC signing keys (FR-002 UC-80). Backs up current keys then generates new EC P-256 keypair.';

    public function handle(): int
    {
        $privatePath = (string) config('sso.signing.private_key_path');
        $publicPath = (string) config('sso.signing.public_key_path');

        if ($privatePath === '' || $publicPath === '') {
            $this->error('Signing key paths not configured (sso.signing.private_key_path / public_key_path).');

            return self::FAILURE;
        }

        $this->line("Private key: {$privatePath}");
        $this->line("Public key:  {$publicPath}");

        if (! $this->option('force') && ! $this->confirm('This will rotate the production signing keys. Existing unexpired tokens will fail to verify. Continue?', false)) {
            $this->warn('Aborted by operator.');

            return self::INVALID;
        }

        $timestamp = now()->format('YmdHis');

        // Step 1: Backup
        if (File::exists($privatePath)) {
            $backupPrivate = "{$privatePath}.retired-{$timestamp}";
            File::copy($privatePath, $backupPrivate);
            $this->info("Backed up private key → {$backupPrivate}");
        }
        if (File::exists($publicPath)) {
            $backupPublic = "{$publicPath}.retired-{$timestamp}";
            File::copy($publicPath, $backupPublic);
            $this->info("Backed up public key  → {$backupPublic}");
        }

        // Step 2: Generate new EC P-256 keypair
        $key = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);

        if ($key === false) {
            $this->error('openssl_pkey_new failed — '.openssl_error_string());

            return self::FAILURE;
        }

        if (! openssl_pkey_export($key, $privatePem)) {
            $this->error('openssl_pkey_export failed.');

            return self::FAILURE;
        }

        $details = openssl_pkey_get_details($key);
        if ($details === false || ! isset($details['key'])) {
            $this->error('openssl_pkey_get_details failed.');

            return self::FAILURE;
        }

        // Step 3: Write new keys
        File::put($privatePath, $privatePem);
        File::chmod($privatePath, 0600);
        File::put($publicPath, (string) $details['key']);
        File::chmod($publicPath, 0644);

        $this->info('✅ New keypair written.');

        // Step 4: Suggest new kid
        $newKid = (string) ($this->option('new-kid') ?? 'sso-prod-'.now()->format('YmdHi'));

        $this->newLine();
        $this->line('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        $this->line(' POST-ROTATION CHECKLIST');
        $this->line('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        $this->line(" 1. Update .env: OIDC_SIGNING_KID={$newKid}");
        $this->line(' 2. Run: php artisan config:clear && php artisan config:cache');
        $this->line(' 3. Run: php artisan octane:reload');
        $this->line(' 4. Verify: curl /.well-known/jwks.json');
        $this->line(' 5. Notify RPs to refresh their JWKS cache');
        $this->line('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        return self::SUCCESS;
    }
}
