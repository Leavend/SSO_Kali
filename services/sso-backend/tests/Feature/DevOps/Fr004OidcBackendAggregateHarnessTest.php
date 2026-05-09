<?php

declare(strict_types=1);

it('locks the complete fr004 oidc backend aggregate evidence set', function (): void {
    foreach (fr004_aggregate_contracts() as $domain => $files) {
        foreach ($files as $relativePath => $needles) {
            $content = fr004_aggregate_file($relativePath);

            expect($content, "{$domain}: {$relativePath} must exist")->toBeString()->not->toBe('');

            foreach ($needles as $needle) {
                expect($content, "{$domain}: {$relativePath} must contain {$needle}")->toContain($needle);
            }
        }
    }
});

it('maps fr004 use cases uc01 through uc23 to backend evidence', function (): void {
    $coverage = fr004_use_case_coverage();

    expect(array_keys($coverage))->toBe([
        'UC-01', 'UC-02', 'UC-07', 'UC-08', 'UC-09', 'UC-12', 'UC-13',
        'UC-14', 'UC-15', 'UC-16', 'UC-17', 'UC-18', 'UC-19', 'UC-20',
        'UC-21', 'UC-22', 'UC-23', 'UC-24', 'UC-25', 'UC-26', 'UC-27',
    ]);

    foreach ($coverage as $useCase => $evidence) {
        expect($evidence, "{$useCase} must have at least one evidence file")->not->toBeEmpty();

        foreach ($evidence as $relativePath) {
            expect(fr004_aggregate_file($relativePath), "{$useCase}: {$relativePath} must exist")
                ->toBeString()
                ->not->toBe('');
        }
    }
});

it('documents fr004 endpoints and production protection middleware', function (): void {
    $routes = fr004_aggregate_file('routes/web.php');

    foreach ([
        "Route::get('/.well-known/openid-configuration'",
        "Route::get('/.well-known/jwks.json'",
        "Route::get('/jwks'",
        "Route::get('/authorize'",
        "Route::post('/token'",
        "Route::match(['get', 'post'], '/userinfo'",
        "Route::post('/revocation'",
        "Route::post('/oauth/revoke'",
        "Route::middleware('throttle:oidc-authorize')",
        "Route::post('/token', TokenController::class)",
        "Route::post('/revocation', RevocationController::class)",
        'ValidateTokenOrigin::class',
        'throttle:oidc-token',
        'throttle:oidc-resource',
    ] as $needle) {
        expect($routes)->toContain($needle);
    }
});

it('keeps every fr004 aggregate dependency wired into ci', function (): void {
    $ci = fr004_aggregate_file('../../.github/workflows/ci.yml');

    foreach (fr004_ci_tests() as $testName) {
        expect($ci, "CI must run {$testName}")->toContain($testName);
    }
});

/**
 * @return array<string, array<string, list<string>>>
 */
function fr004_aggregate_contracts(): array
{
    return [
        'discovery_and_jwks' => [
            'tests/Feature/Oidc/DiscoveryDocumentTest.php' => ['openid-configuration', 'jwks_uri', 'authorization_endpoint'],
            'app/Services/Oidc/OidcCatalog.php' => ['issuer', 'token_endpoint', 'userinfo_endpoint'],
            'app/Http/Controllers/Oidc/JwksController.php' => ['OidcCatalog', 'jwks'],
            'app/Services/Oidc/SigningKeyService.php' => ['jwks', 'kid'],
        ],
        'authorization_request_and_code' => [
            'tests/Feature/Oidc/AuthorizationCodeFlowE2EContractTest.php' => ['public client authorization code flow', 'confidential client secret', 'single use code'],
            'tests/Feature/Oidc/ConsentFlowContractTest.php' => ['prompt none', 'login_required', 'select_account'],
            'app/Actions/Oidc/CreateAuthorizationRedirect.php' => ['invalidPromptRequested', 'prompt=none', 'consent'],
            'app/Services/Oidc/AuthorizationCodeStore.php' => ['authorization_codes', 'consumed_at', 'lockForUpdate'],
            'app/Services/Oidc/AuthRequestStore.php' => ['oidc:auth-request'],
            'app/Services/Oidc/ScopePolicy.php' => ['validateAuthorizationRequest', 'assertAllowed'],
        ],
        'token_endpoint_and_lifecycle' => [
            'tests/Feature/Oidc/RefreshTokenRotationReplayContractTest.php' => ['rotates refresh tokens', 'replay', 'token family'],
            'tests/Feature/Oidc/TokenEndpointHardeningContractTest.php' => ['invalid grants', 'client secret', 'unsupported grant types'],
            'app/Actions/Oidc/ExchangeToken.php' => ['authorization_code', 'refresh_token', 'validPkce', 'rotatedTokens'],
            'app/Services/Oidc/LocalTokenService.php' => ['access_token', 'refresh_token', 'id_token', 'expires_in'],
            'app/Services/Oidc/RefreshTokenStore.php' => ['rotate', 'findActive', 'revoke'],
            'tests/Feature/Oidc/LoadTestClientRegistryTest.php' => ['load-test client', 'sso-load-test-client'],
        ],
        'client_registry_and_secret_validation' => [
            'app/Services/Oidc/DownstreamClientRegistry.php' => ['resolve', 'validSecret', 'verify'],
            'tests/Feature/Oidc/LockedProductionClientRegistryTest.php' => ['locked production client id set'],
            'tests/Feature/Oidc/ProductionClientRegistryTest.php' => ['redirect_uri', 'client secret'],
        ],
        'jwt_validation_and_userinfo' => [
            'tests/Feature/Oidc/JwtValidationClaimContractTest.php' => ['production jwt claims', 'scope-bound profile claims', 'alg none tokens'],
            'tests/Feature/Oidc/UserInfoEndpointClaimsContractTest.php' => ['valid bearer access token', 'scope-bound', 'invalid_token'],
            'app/Services/Oidc/AccessTokenGuard.php' => ['aud', 'exp', 'iss', 'revoked'],
            'app/Actions/Oidc/BuildUserInfo.php' => ['AccessTokenGuard', 'ClaimsView'],
            'app/Services/Oidc/UserClaimsFactory.php' => ['OidcScope::ROLES', 'OidcScope::PERMISSIONS'],
            'tests/Feature/Oidc/UserClaimsFactoryScopeEnforcementTest.php' => ['emits roles and permissions only when RBAC scopes are granted'],
            'tests/Feature/Oidc/OidcIncidentAuditLoggingContractTest.php' => ['oidc.security_incident', 'redacted', 'chained'],
            'app/Services/Oidc/OidcIncidentAuditLogger.php' => ['OIDC_SECURITY_INCIDENT', 'SECRET_KEYS', 'request_id'],
        ],
        'revocation_endpoint' => [
            'tests/Feature/Oidc/RevocationEndpointRfc7009ContractTest.php' => ['rfc7009', 'token_type_hint', 'idempotent'],
            'app/Actions/Oidc/RevokeToken.php' => ['token_type_hint', 'refresh_token', 'revokeAccessToken'],
            'app/Services/Oidc/AccessTokenRevocationStore.php' => ['revoke', 'revoked'],
            'tests/Feature/Oidc/BackChannelLogoutPartialFailureContractTest.php' => ['partial queue dispatch failures'],
            'tests/Feature/Oidc/BackChannelLogoutOperationalDrillTest.php' => ['retryable auditable and secret-safe'],
        ],
        'connected_apps_self_service_revocation' => [
            'tests/Feature/Profile/ConnectedAppsSelfServiceRevocationContractTest.php' => ['connected_apps', 'profile.connected_app_revoked', 'revoked_refresh_tokens'],
            'app/Services/Profile/ConnectedAppsService.php' => ['active_refresh_tokens', 'display_name'],
            'app/Actions/Profile/RevokeConnectedAppAction.php' => ['revokeClientSessionsForSubject', 'profile.connected_app.revoke'],
            'routes/web.php' => ['/api/profile/connected-apps', 'revokeConnectedApp'],
        ],
        'fr004_production_smoke' => [
            'tests/Feature/DevOps/Fr004ProductionSmokeHarnessTest.php' => ['FR-004 production smoke', 'error=login_required', 'error=invalid_request'],
            '../../scripts/sso-backend-fr004-production-smoke.sh' => ['prompt=none', '/userinfo', 'without secrets or tokens'],
            '../../docs/devops/sso-backend-fr004-production-smoke.md' => ['OIDC discovery metadata', 'Evidence to Retain', 'RUN_FR004_PRODUCTION_SMOKE=true'],
        ],
    ];
}

/**
 * @return array<string, list<string>>
 */
function fr004_use_case_coverage(): array
{
    return [
        'UC-01' => ['tests/Feature/Oidc/DiscoveryDocumentTest.php'],
        'UC-02' => ['app/Http/Controllers/Oidc/JwksController.php', 'app/Services/Oidc/SigningKeyService.php'],
        'UC-07' => ['tests/Feature/Oidc/AuthorizationCodeFlowE2EContractTest.php', 'app/Actions/Oidc/CreateAuthorizationRedirect.php'],
        'UC-08' => ['routes/auth.php', 'app/Http/Controllers/Auth/LoginController.php'],
        'UC-09' => ['app/Services/Oidc/BrokerBrowserSession.php'],
        'UC-12' => ['tests/Feature/Oidc/AuthorizationCodeFlowE2EContractTest.php', 'app/Services/Oidc/AuthorizationCodeStore.php'],
        'UC-13' => ['tests/Feature/Oidc/AuthorizationCodeFlowE2EContractTest.php', 'app/Actions/Oidc/CreateAuthorizationRedirect.php'],
        'UC-14' => ['tests/Feature/Oidc/TokenEndpointHardeningContractTest.php', 'tests/Feature/Oidc/AuthorizationCodeFlowE2EContractTest.php', 'app/Actions/Oidc/ExchangeToken.php'],
        'UC-15' => ['tests/Feature/Oidc/TokenEndpointHardeningContractTest.php', 'tests/Feature/Oidc/AuthorizationCodeFlowE2EContractTest.php', 'app/Actions/Oidc/ExchangeToken.php', 'app/Support/Oidc/Pkce.php'],
        'UC-16' => ['tests/Feature/Oidc/TokenEndpointHardeningContractTest.php', 'tests/Feature/Oidc/AuthorizationCodeFlowE2EContractTest.php', 'app/Services/Oidc/DownstreamClientRegistry.php'],
        'UC-17' => ['tests/Feature/Oidc/JwtValidationClaimContractTest.php', 'tests/Feature/Oidc/TokenEndpointHardeningContractTest.php', 'app/Services/Oidc/LocalTokenService.php'],
        'UC-18' => ['tests/Feature/Oidc/RefreshTokenRotationReplayContractTest.php', 'app/Services/Oidc/RefreshTokenStore.php'],
        'UC-19' => ['tests/Feature/Oidc/RefreshTokenRotationReplayContractTest.php', 'tests/Feature/Oidc/TokenEndpointHardeningContractTest.php', 'app/Actions/Oidc/ExchangeToken.php'],
        'UC-20' => ['tests/Feature/Oidc/RefreshTokenRotationReplayContractTest.php', 'app/Services/Oidc/RefreshTokenStore.php'],
        'UC-21' => ['tests/Feature/Oidc/RevocationEndpointRfc7009ContractTest.php', 'app/Actions/Oidc/RevokeToken.php'],
        'UC-22' => ['tests/Feature/Oidc/JwtValidationClaimContractTest.php', 'app/Services/Oidc/AccessTokenGuard.php'],
        'UC-23' => ['tests/Feature/Oidc/UserInfoEndpointClaimsContractTest.php', 'tests/Feature/Oidc/JwtValidationClaimContractTest.php', 'app/Http/Controllers/Oidc/UserInfoController.php'],
        'UC-24' => ['tests/Feature/Oidc/OidcIncidentAuditLoggingContractTest.php', 'app/Services/Oidc/OidcIncidentAuditLogger.php'],
        'UC-25' => ['tests/Feature/Oidc/ConsentFlowContractTest.php', 'app/Actions/Oidc/CreateAuthorizationRedirect.php'],
        'UC-26' => ['tests/Feature/Profile/ConnectedAppsSelfServiceRevocationContractTest.php', 'app/Actions/Profile/RevokeConnectedAppAction.php'],
        'UC-27' => ['tests/Feature/DevOps/Fr004ProductionSmokeHarnessTest.php', '../../scripts/sso-backend-fr004-production-smoke.sh'],
    ];
}

/**
 * @return list<string>
 */
function fr004_ci_tests(): array
{
    return [
        'Fr004OidcBackendAggregateHarnessTest.php',
        'AuthorizationCodeFlowE2EContractTest.php',
        'ConsentFlowContractTest.php',
        'ConnectedAppsSelfServiceRevocationContractTest.php',
        'Fr004ProductionSmokeHarnessTest.php',
        'TokenEndpointHardeningContractTest.php',
        'JwtValidationClaimContractTest.php',
        'RefreshTokenRotationReplayContractTest.php',
        'RevocationEndpointRfc7009ContractTest.php',
        'UserInfoEndpointClaimsContractTest.php',
        'OidcIncidentAuditLoggingContractTest.php',
        'LockedProductionClientRegistryTest.php',
        'ProductionClientRegistryTest.php',
        'LoadTestClientRegistryTest.php',
        'UserClaimsFactoryScopeEnforcementTest.php',
        'BackChannelLogoutAcceptanceTest.php',
        'BackChannelLogoutPartialFailureContractTest.php',
        'BackChannelLogoutOperationalDrillTest.php',
        'FrontChannelLogoutFlowTest.php',
        'CentralizedLogoutTest.php',
    ];
}

function fr004_aggregate_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
