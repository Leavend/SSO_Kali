<?php

declare(strict_types=1);

it('does not expose admin API routes without authentication', function (string $method, string $uri): void {
    $this->json($method, $uri)
        ->assertStatus(401);
})->with([
    'admin me' => ['GET', '/admin/api/me'],
    'admin clients' => ['GET', '/admin/api/clients'],
    'admin users' => ['GET', '/admin/api/users'],
    'admin user detail' => ['GET', '/admin/api/users/user-1'],
    'admin sessions' => ['GET', '/admin/api/sessions'],
    'admin session detail' => ['GET', '/admin/api/sessions/sid-1'],
    'delete admin session' => ['DELETE', '/admin/api/sessions/sid-1'],
    'delete user sessions' => ['DELETE', '/admin/api/users/user-1/sessions'],
    'client registrations' => ['GET', '/admin/api/client-integrations/registrations'],
    'stage client' => ['POST', '/admin/api/client-integrations/stage'],
    'contract client' => ['POST', '/admin/api/client-integrations/contract'],
    'activate client' => ['POST', '/admin/api/client-integrations/app-a/activate'],
    'disable client' => ['POST', '/admin/api/client-integrations/app-a/disable'],
]);

it('rejects protected resource routes without bearer credentials', function (string $method, string $uri): void {
    $this->json($method, $uri)
        ->assertStatus(401);
})->with([
    'profile' => ['GET', '/api/profile'],
]);

it('keeps unauthenticated revocation and logout responses safe', function (): void {
    $this->getJson('/api/auth/session')
        ->assertStatus(401);

    $this->postJson('/oauth/revoke')
        ->assertOk();

    $this->postJson('/api/auth/logout')
        ->assertOk()
        ->assertJsonPath('authenticated', false)
        ->assertJsonPath('revoked', false);
});
