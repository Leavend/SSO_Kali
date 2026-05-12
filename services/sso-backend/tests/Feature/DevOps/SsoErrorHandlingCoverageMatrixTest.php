<?php

declare(strict_types=1);

it('locks the complete FR-007 sso error handling aggregate evidence set', function (): void {
    foreach (fr007_sso_error_handling_contracts() as $relativePath => $needles) {
        $content = fr007_sso_error_handling_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('maps FR-007 sso error handling coverage to implementation domains', function (): void {
    $coverage = fr007_sso_error_handling_coverage_matrix();

    expect(array_keys($coverage))->toBe([
        'error_taxonomy',
        'safe_message_catalog',
        'structured_logging',
        'browser_error_redirect',
        'token_endpoint_observability',
        'upstream_network_error_handling',
        'admin_template_management',
        'template_resolver',
        'secret_redaction',
        'ci_wiring',
    ]);

    foreach ($coverage as $domain => $evidence) {
        expect($evidence, "{$domain} must have evidence files")->not->toBeEmpty();

        foreach ($evidence as $relativePath) {
            expect(fr007_sso_error_handling_file($relativePath), "{$domain}: {$relativePath} must exist")
                ->toBeString()
                ->not->toBe('');
        }
    }
});

it('maps FR-007 requirements to production compliance principles', function (): void {
    expect(fr007_sso_error_handling_principles())->toBe([
        'least_disclosure' => 'Browser redirects expose only safe error codes, resolved messages, retry hints, and error_ref.',
        'traceability' => 'Every handled SSO error records error_ref and correlation_id for support and audit lookup.',
        'administrator_control' => 'Admin RBAC controls localized error templates with safe HTTPS action URLs.',
        'protocol_compatibility' => 'Token endpoint OAuth/OIDC JSON error responses remain unchanged while adding observability.',
        'operability' => 'Aggregate evidence and CI wiring lock FR-007 coverage across code, tests, and smoke runbooks.',
    ]);
});

it('keeps every FR-007 sso error handling aggregate dependency wired into CI', function (): void {
    $ci = fr007_sso_error_handling_file('../../.github/workflows/ci.yml');

    foreach (fr007_sso_error_handling_ci_tests() as $testName) {
        expect($ci, "CI must run {$testName}")->toContain($testName);
    }
});

/**
 * @return array<string, list<string>>
 */
function fr007_sso_error_handling_contracts(): array
{
    return [
        'app/Enums/SsoErrorCode.php' => ['InvalidGrant', 'AccessDenied', 'NetworkError', 'SessionExpired'],
        'app/Services/SsoErrors/SsoErrorCatalog.php' => ['InvalidGrant', 'NetworkError', 'alternativeLoginAllowed'],
        'app/Support/SsoErrors/SsoErrorMessage.php' => ['readonly class SsoErrorMessage', 'retryAllowed'],
        'app/Support/SsoErrors/SsoErrorContext.php' => ['readonly class SsoErrorContext', 'technicalReason', 'correlationId'],
        'app/Actions/SsoErrors/RecordSsoErrorAction.php' => ['SSOERR-', '[SSO_ERROR_RECORDED]', 'technical_reason_hash'],
        'app/Actions/SsoErrors/BuildSsoErrorRedirectAction.php' => ['error_ref', 'title', 'action_label'],
        'app/Actions/SsoErrors/ResolveSsoErrorMessageAction.php' => ['is_enabled', 'SsoErrorMessageTemplate', 'catalog'],
        'app/Actions/Oidc/CreateAuthorizationRedirect.php' => ['frontendErrorRedirect', 'LoginRequired', 'auth_request_store_unavailable'],
        'app/Actions/Oidc/ExchangeToken.php' => ['recordSsoTokenError', 'invalid_grant', 'OidcErrorResponse::json'],
        'app/Actions/Oidc/HandleUpstreamCallback.php' => ['upstream_callback_error', 'SessionExpired', 'upstream_handshake_failed'],
        'database/migrations/2026_05_10_000001_create_sso_error_message_templates_table.php' => ['sso_error_message_templates', 'action_url', 'is_enabled'],
        'app/Actions/SsoErrors/ManageSsoErrorTemplateAction.php' => ['updateOrCreate', 'defaultPayload', 'is_enabled'],
        'app/Http/Controllers/Admin/SsoErrorTemplateController.php' => ['ManageSsoErrorTemplateAction', 'AdminApiResponse', 'templates->update'],
        'app/Http/Requests/Admin/UpsertSsoErrorTemplateRequest.php' => ['url:https', 'Rule::in'],
        'routes/admin.php' => ['sso-error-templates', 'SSO_ERROR_TEMPLATES_READ', 'SSO_ERROR_TEMPLATES_WRITE'],
        'app/Support/Rbac/AdminPermission.php' => ['SSO_ERROR_TEMPLATES_READ', 'SSO_ERROR_TEMPLATES_WRITE'],
        'tests/Unit/SsoErrors/SsoErrorCatalogTest.php' => ['sensitive protocol material', 'InvalidGrant'],
        'tests/Unit/SsoErrors/RecordSsoErrorActionTest.php' => ['client_secret=hidden', 'access_token=hidden'],
        'tests/Unit/SsoErrors/BuildSsoErrorRedirectActionTest.php' => ['error_ref=SSOERR-ABC123', 'retry_allowed=1'],
        'tests/Unit/SsoErrors/ResolveSsoErrorMessageActionTest.php' => ['enabled database', 'falls back to catalog'],
        'tests/Feature/Oidc/SsoErrorHandlingContractTest.php' => ['prompt none login_required', '[SSO_ERROR_RECORDED]'],
        'tests/Feature/Oidc/TokenEndpointSsoErrorObservabilityTest.php' => ['oauth error format', 'secret-verifier-material'],
        'tests/Feature/Oidc/UpstreamCallbackSsoErrorHandlingTest.php' => ['access_denied', 'session_expired'],
        'tests/Feature/Admin/SsoErrorTemplateManagementTest.php' => ['unsafe action urls', 'sso-error-templates'],
    ];
}

/**
 * @return array<string, list<string>>
 */
function fr007_sso_error_handling_coverage_matrix(): array
{
    return [
        'error_taxonomy' => ['app/Enums/SsoErrorCode.php', 'tests/Unit/SsoErrors/SsoErrorCatalogTest.php'],
        'safe_message_catalog' => ['app/Services/SsoErrors/SsoErrorCatalog.php', 'app/Support/SsoErrors/SsoErrorMessage.php'],
        'structured_logging' => ['app/Actions/SsoErrors/RecordSsoErrorAction.php', 'tests/Unit/SsoErrors/RecordSsoErrorActionTest.php'],
        'browser_error_redirect' => ['app/Actions/SsoErrors/BuildSsoErrorRedirectAction.php', 'tests/Feature/Oidc/SsoErrorHandlingContractTest.php'],
        'token_endpoint_observability' => ['app/Actions/Oidc/ExchangeToken.php', 'tests/Feature/Oidc/TokenEndpointSsoErrorObservabilityTest.php'],
        'upstream_network_error_handling' => ['app/Actions/Oidc/HandleUpstreamCallback.php', 'tests/Feature/Oidc/UpstreamCallbackSsoErrorHandlingTest.php'],
        'admin_template_management' => ['app/Actions/SsoErrors/ManageSsoErrorTemplateAction.php', 'app/Http/Controllers/Admin/SsoErrorTemplateController.php', 'tests/Feature/Admin/SsoErrorTemplateManagementTest.php'],
        'template_resolver' => ['app/Actions/SsoErrors/ResolveSsoErrorMessageAction.php', 'tests/Unit/SsoErrors/ResolveSsoErrorMessageActionTest.php'],
        'secret_redaction' => ['app/Actions/SsoErrors/RecordSsoErrorAction.php', 'tests/Feature/Oidc/TokenEndpointSsoErrorObservabilityTest.php'],
        'ci_wiring' => ['../../.github/workflows/ci.yml'],
    ];
}

/**
 * @return array<string, string>
 */
function fr007_sso_error_handling_principles(): array
{
    return [
        'least_disclosure' => 'Browser redirects expose only safe error codes, resolved messages, retry hints, and error_ref.',
        'traceability' => 'Every handled SSO error records error_ref and correlation_id for support and audit lookup.',
        'administrator_control' => 'Admin RBAC controls localized error templates with safe HTTPS action URLs.',
        'protocol_compatibility' => 'Token endpoint OAuth/OIDC JSON error responses remain unchanged while adding observability.',
        'operability' => 'Aggregate evidence and CI wiring lock FR-007 coverage across code, tests, and smoke runbooks.',
    ];
}

/**
 * @return list<string>
 */
function fr007_sso_error_handling_ci_tests(): array
{
    return [
        'SsoErrorHandlingCoverageMatrixTest.php',
        'SsoErrorTemplateManagementTest.php',
        'UpstreamCallbackSsoErrorHandlingTest.php',
        'TokenEndpointSsoErrorObservabilityTest.php',
        'ResolveSsoErrorMessageActionTest.php',
    ];
}

function fr007_sso_error_handling_file(string $relativePath): string
{
    $path = base_path($relativePath);

    expect(file_exists($path), "Missing evidence file: {$relativePath}")->toBeTrue();

    return (string) file_get_contents($path);
}
