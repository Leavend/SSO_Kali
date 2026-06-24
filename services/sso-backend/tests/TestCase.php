<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Uri;

abstract class TestCase extends BaseTestCase
{
    /**
     * @param  Uri|string  $uri
     */
    public function json($method, $uri, array $data = [], array $headers = [], $options = 0)
    {
        if ($this->isFirstPartyBrowserMutation((string) $method, (string) $uri)) {
            $headers += [
                'Origin' => (string) config('sso.frontend_url', 'http://localhost:3000'),
                'X-Requested-With' => 'XMLHttpRequest',
            ];
        }

        return parent::json($method, $uri, $data, $headers, $options);
    }

    private function isFirstPartyBrowserMutation(string $method, string $uri): bool
    {
        if (! in_array(strtoupper($method), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return false;
        }

        $path = ltrim(parse_url($uri, PHP_URL_PATH) ?: $uri, '/');

        return str_starts_with($path, 'api/auth/')
            || str_starts_with($path, 'api/profile/')
            || $path === 'api/profile'
            || str_starts_with($path, 'api/mfa/');
    }
}
