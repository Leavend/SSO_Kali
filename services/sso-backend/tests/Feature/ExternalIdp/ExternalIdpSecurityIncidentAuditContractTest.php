<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\CreateExternalIdpAuthenticationRedirectAction;
use App\Actions\ExternalIdp\ExchangeExternalIdpCallbackTokenAction;
use App\Actions\ExternalIdp\LinkExternalSubjectAccountAction;
use App\Actions\ExternalIdp\RecordExternalIdpSecurityIncidentAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Models\ExternalSubjectLink;
use App\Models\User;

it('records centralized external idp security incidents with severity and redaction', function (): void {
    $provider = issue69Provider('security-central');

    app(RecordExternalIdpSecurityIncidentAction::class)->execute(
        'external_idp.discovery.metadata_tamper',
        'issuer_mismatch',
        $provider,
        [
            'request_id' => 'ctx-request-overridden',
            'access_token' => 'secret-access-token',
            'nested' => ['client_secret' => 'secret-client'],
            'safe' => 'value',
        ],
        new RuntimeException('issuer mismatch: secret-access-token'),
        'issue69-central',
        'critical',
    );

    $event = issue69LatestIncident('external_idp.discovery.metadata_tamper');
    $encoded = json_encode($event->context, JSON_THROW_ON_ERROR);

    expect($event->taxonomy)->toBe('external_idp.security_incident')
        ->and($event->outcome)->toBe('denied')
        ->and($event->reason)->toBe('issuer_mismatch')
        ->and($event->context['provider_key'])->toBe('security-central')
        ->and($event->context['severity'])->toBe('critical')
        ->and($event->context['classification'])->toBe('external_identity_provider')
        ->and($event->context['safe'])->toBe('value')
        ->and($encoded)->not->toContain('secret-access-token')
        ->and($encoded)->not->toContain('client_secret')
        ->and($encoded)->not->toContain('access_token');
});

it('records auth redirect failure as external idp security incident', function (): void {
    $provider = issue69Provider('redirect-fail');
    $provider->forceFill(['enabled' => false])->save();

    expect(fn () => app(CreateExternalIdpAuthenticationRedirectAction::class)->execute($provider->refresh(), [
        'request_id' => 'issue69-redirect',
        'return_to' => 'https://sso.timeh.my.id/admin',
        'client_secret' => 'secret-client',
    ]))->toThrow(RuntimeException::class);

    $event = issue69LatestIncident('external_idp.auth.redirect_failure');
    $encoded = json_encode($event->context, JSON_THROW_ON_ERROR);

    expect($event->reason)->toBe('external_idp_auth_redirect_failed')
        ->and($event->context['request_id'])->toBe('issue69-redirect')
        ->and($event->context['severity'])->toBe('high')
        ->and($encoded)->not->toContain('secret-client')
        ->and($encoded)->not->toContain('client_secret');
});

it('records callback exchange failure as critical incident without state or code leakage', function (): void {
    $provider = issue69Provider('callback-fail');
    expect(fn () => app(ExchangeExternalIdpCallbackTokenAction::class)->execute(
        $provider,
        'state-secret-material',
        'secret-code',
        'issue69-callback',
    ))->toThrow(RuntimeException::class);

    $event = issue69LatestIncident('external_idp.callback.exchange_failure');
    $encoded = json_encode($event->context, JSON_THROW_ON_ERROR);

    expect($event->context['request_id'])->toBe('issue69-callback')
        ->and($event->context['severity'])->toBe('critical')
        ->and($encoded)->not->toContain('secret-code')
        ->and($encoded)->not->toContain('state-secret-material')
        ->and($encoded)->not->toContain('code');
});

it('records account link takeover protection failure as critical incident with redacted raw claims', function (): void {
    $provider = issue69Provider('link-fail');
    User::factory()->create(['email' => 'existing@example.test']);

    expect(fn () => app(LinkExternalSubjectAccountAction::class)->execute($provider, [
        'provider_key' => 'link-fail',
        'subject' => 'attacker-subject',
        'email' => 'existing@example.test',
        'name' => 'Attacker',
        'email_verified' => false,
        'access_token' => 'secret-access-token',
        'claims' => ['email_verified' => false, 'access_token' => 'secret-access-token'],
    ], 'issue69-link'))->toThrow(RuntimeException::class);

    $event = issue69LatestIncident('external_idp.account.link_failure');
    $encoded = json_encode($event->context, JSON_THROW_ON_ERROR);

    expect($event->reason)->toBe('external_idp_account_link_failed')
        ->and($event->context['request_id'])->toBe('issue69-link')
        ->and($event->context['severity'])->toBe('critical')
        ->and($event->context['classification'])->toBe('external_identity_provider')
        ->and($encoded)->not->toContain('secret-access-token')
        ->and($encoded)->not->toContain('access_token');

    expect(ExternalSubjectLink::query()->where('external_subject', 'attacker-subject')->exists())->toBeFalse();
});

it('keeps external idp security incident audit events hash chained', function (): void {
    $provider = issue69Provider('chain');
    $action = app(RecordExternalIdpSecurityIncidentAction::class);

    $action->execute('external_idp.chain.one', 'first', $provider, [], null, 'issue69-chain-1');
    $action->execute('external_idp.chain.two', 'second', $provider, [], null, 'issue69-chain-2');

    $events = AdminAuditEvent::query()
        ->where('taxonomy', 'external_idp.security_incident')
        ->orderBy('id')
        ->get();

    expect($events)->toHaveCount(2)
        ->and($events[0]->event_hash)->not->toBeNull()
        ->and($events[1]->previous_hash)->toBe($events[0]->event_hash);
});

function issue69Provider(string $providerKey): ExternalIdentityProvider
{
    $issuer = 'https://'.$providerKey.'.idp.example.test/realms/sso';

    return ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => str($providerKey)->replace('-', ' ')->title()->toString(),
        'issuer' => $issuer,
        'metadata_url' => $issuer.'/.well-known/openid-configuration',
        'client_id' => 'sso-upstream',
        'client_secret_encrypted' => null,
        'authorization_endpoint' => $issuer.'/protocol/openid-connect/auth',
        'token_endpoint' => $issuer.'/protocol/openid-connect/token',
        'userinfo_endpoint' => $issuer.'/protocol/openid-connect/userinfo',
        'jwks_uri' => $issuer.'/protocol/openid-connect/certs',
        'allowed_algorithms' => ['RS256'],
        'scopes' => ['openid', 'profile', 'email'],
        'enabled' => true,
        'is_backup' => false,
        'priority' => 100,
        'tls_validation_enabled' => true,
        'signature_validation_enabled' => true,
        'health_status' => 'healthy',
    ]);
}

function issue69LatestIncident(string $action): AdminAuditEvent
{
    $event = AdminAuditEvent::query()
        ->where('action', $action)
        ->where('taxonomy', 'external_idp.security_incident')
        ->latest('id')
        ->first();

    expect($event)->toBeInstanceOf(AdminAuditEvent::class);

    return $event;
}
