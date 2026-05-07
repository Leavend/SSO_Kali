<?php

declare(strict_types=1);

it('exposes a backend login route that bridges unauthenticated OAuth browsers to the Vue login page', function (): void {
    config()->set('sso.login_url', 'http://localhost:3000/login');

    $this->get('/login?client_id=sso-admin-panel&state=abc')
        ->assertRedirect('http://localhost:3000/login?return_to=http%3A%2F%2Flocalhost%2Foauth%2Fauthorize%3Fclient_id%3Dsso-admin-panel%26state%3Dabc');
});

it('registers Passport authorize and token endpoints for the admin-panel OAuth flow', function (): void {
    $routes = collect(app('router')->getRoutes())->map(fn ($route): string => $route->uri())->all();

    expect($routes)->toContain('oauth/authorize')
        ->and($routes)->toContain('oauth/token');
});
