<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

pest()->extend(TestCase::class)
    ->in('Unit');

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->beforeEach(function (): void {
        config()->set('sso.identity.nik_hash_key', 'test-government-identifier-hash-key');

        // The backfill_client_registrations migration seeds oidc_client_registrations
        // from config. Wipe them so OIDC contract tests (which override config)
        // are not polluted by stale DB rows that would win via DB-wins precedence.
        if (Schema::hasTable('oidc_client_registrations')) {
            OidcClientRegistration::query()->delete();
        }
    })
    ->in('Feature');
