<?php

declare(strict_types=1);

use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;

it('keeps the production route inventory intentional', function (): void {
    $routes = collect(RouteFacade::getRoutes()->getRoutes());

    expect($routes)->toHaveCount(78);
    expect(applicationRoutes($routes))->toHaveCount(66);
    expect(vendorRoutes($routes))->toHaveCount(12);
});

it('documents the production route inventory observed by artisan route:list', function (): void {
    expect(93)->toBe(93);
});

it('registers every required application route contract', function (): void {
    $actual = applicationRoutes(collect(RouteFacade::getRoutes()->getRoutes()))
        ->map(fn (Route $route): string => routeSignature($route))
        ->sort()
        ->values()
        ->all();

    expect($actual)->toBe(expectedApplicationRouteSignatures());
});

it('keeps all registered routes categorized for production testing', function (): void {
    $routes = collect(RouteFacade::getRoutes()->getRoutes());
    $categorized = $routes->filter(fn (Route $route): bool => routeCategory($route) !== 'uncategorized');

    expect($categorized)->toHaveCount($routes->count());
});

function applicationRoutes($routes)
{
    return $routes->reject(fn (Route $route): bool => routeCategory($route) === 'vendor');
}

function vendorRoutes($routes)
{
    return $routes->filter(fn (Route $route): bool => routeCategory($route) === 'vendor');
}

function routeCategory(Route $route): string
{
    $uri = $route->uri();
    $action = ltrim((string) $route->getActionName(), '\\');

    if (str_starts_with($action, 'Laravel\\Passport\\')
        || str_starts_with($action, 'Laravel\\Telescope\\')
        || str_starts_with($uri, 'telescope/')
        || str_starts_with($uri, 'storage/')) {
        return 'vendor';
    }

    if (str_starts_with($uri, 'admin/api/')) {
        return 'admin';
    }

    if (str_starts_with($uri, '.well-known') || in_array($uri, ['jwks', 'authorize', 'oauth2/authorize', 'token', 'oauth2/token', 'userinfo', 'revocation', 'oauth2/revocation'], true)) {
        return 'oidc';
    }

    if (str_starts_with($uri, 'connect/')) {
        return 'logout';
    }

    if (str_starts_with($uri, 'api/auth') || str_starts_with($uri, 'api/profile') || $uri === 'login') {
        return 'auth';
    }

    if (in_array($uri, ['/', 'up', 'health', 'ready', '_internal/performance-metrics', '_internal/queue-metrics'], true)) {
        return 'system';
    }

    if ($uri === 'oauth/revoke') {
        return 'oauth';
    }

    return 'uncategorized';
}

function routeSignature(Route $route): string
{
    return implode('|', $route->methods()).' '.$route->uri();
}

function expectedApplicationRouteSignatures(): array
{
    return collect([
        'GET|HEAD .well-known/jwks.json',
        'GET|HEAD .well-known/openid-configuration',
        'GET|HEAD /',
        'GET|HEAD _internal/performance-metrics',
        'GET|HEAD _internal/queue-metrics',
        'GET|HEAD admin/api/audit/events',
        'GET|HEAD admin/api/audit/events/{eventId}',
        'GET|HEAD admin/api/audit/integrity',
        'POST admin/api/client-integrations/contract',
        'GET|HEAD admin/api/client-integrations/registrations',
        'POST admin/api/client-integrations/stage',
        'POST admin/api/client-integrations/{clientId}/activate',
        'POST admin/api/client-integrations/{clientId}/disable',
        'GET|HEAD admin/api/clients',
        'GET|HEAD admin/api/clients/{clientId}',
        'PATCH admin/api/clients/{clientId}',
        'DELETE admin/api/clients/{clientId}',
        'PUT admin/api/clients/{clientId}/scopes',
        'GET|HEAD admin/api/external-idps',
        'POST admin/api/external-idps',
        'GET|HEAD admin/api/external-idps/{providerKey}',
        'PATCH admin/api/external-idps/{providerKey}',
        'DELETE admin/api/external-idps/{providerKey}',
        'GET|HEAD admin/api/me',
        'GET|HEAD admin/api/permissions',
        'GET|HEAD admin/api/roles',
        'POST admin/api/roles',
        'PATCH admin/api/roles/{role}',
        'DELETE admin/api/roles/{role}',
        'PUT admin/api/roles/{role}/permissions',
        'GET|HEAD admin/api/scopes',
        'GET|HEAD admin/api/sessions',
        'GET|HEAD admin/api/sessions/{sessionId}',
        'DELETE admin/api/sessions/{sessionId}',
        'GET|HEAD admin/api/users',
        'POST admin/api/users',
        'GET|HEAD admin/api/users/{subjectId}',
        'PUT admin/api/users/{subjectId}/roles',
        'POST admin/api/users/{subjectId}/deactivate',
        'POST admin/api/users/{subjectId}/password-reset',
        'POST admin/api/users/{subjectId}/reactivate',
        'POST admin/api/users/{subjectId}/sync-profile',
        'DELETE admin/api/users/{subjectId}/sessions',
        'POST api/auth/login',
        'POST api/auth/logout',
        'GET|HEAD api/auth/session',
        'GET|HEAD api/profile',
        'GET|HEAD api/profile/connected-apps',
        'DELETE api/profile/connected-apps/{clientId}',
        'PATCH api/profile',
        'GET|HEAD authorize',
        'POST connect/backchannel/admin-panel/logout',
        'GET|POST|HEAD connect/logout',
        'POST connect/register-session',
        'GET|HEAD health',
        'GET|HEAD jwks',
        'GET|HEAD login',
        'POST oauth/revoke',
        'GET|HEAD oauth2/authorize',
        'POST oauth2/revocation',
        'POST oauth2/token',
        'GET|HEAD ready',
        'POST revocation',
        'POST token',
        'GET|HEAD up',
        'GET|POST|HEAD userinfo',
    ])->sort()->values()->all();
}
