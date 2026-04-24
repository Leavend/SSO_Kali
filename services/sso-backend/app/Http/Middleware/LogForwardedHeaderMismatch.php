<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

final class LogForwardedHeaderMismatch
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $this->logMismatch($request);

        return $next($request);
    }

    private function logMismatch(Request $request): void
    {
        if (! $this->shouldInspect($request)) {
            return;
        }

        $context = $this->mismatchContext($request);

        if ($context !== null) {
            Log::warning('[FORWARDED_HEADER_MISMATCH]', $context);
        }
    }

    private function shouldInspect(Request $request): bool
    {
        return $request->is(
            'authorize',
            'oauth2/authorize',
            'callbacks/*',
            '.well-known/*',
            'jwks',
            'userinfo',
            'token',
            'oauth2/token',
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    private function mismatchContext(Request $request): ?array
    {
        $expectedHost = parse_url((string) config('sso.base_url'), PHP_URL_HOST);
        $expectedProto = parse_url((string) config('sso.base_url'), PHP_URL_SCHEME);

        if (! is_string($expectedHost) || ! is_string($expectedProto)) {
            return null;
        }

        $context = $this->context($request, $expectedHost, $expectedProto);
        $reasons = $this->reasons($context);

        if ($this->shouldIgnore($reasons)) {
            return null;
        }

        $context['reasons'] = $reasons;

        return $context;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return list<string>
     */
    private function reasons(array $context): array
    {
        $reasons = [];

        if ($context['forwarded_host'] === null) {
            $reasons[] = 'missing_forwarded_host';
        } elseif ($context['forwarded_host'] !== $context['expected_host']) {
            $reasons[] = 'forwarded_host_mismatch';
        }

        if ($context['forwarded_proto'] === null) {
            $reasons[] = 'missing_forwarded_proto';
        } elseif ($context['forwarded_proto'] !== $context['expected_proto']) {
            $reasons[] = 'forwarded_proto_mismatch';
        }

        return $reasons;
    }

    /**
     * @return array<string, mixed>
     */
    private function context(Request $request, string $expectedHost, string $expectedProto): array
    {
        return [
            'expected_host' => $expectedHost,
            'expected_proto' => $expectedProto,
            'forwarded_host' => $this->firstHeaderValue($request, 'X-Forwarded-Host'),
            'forwarded_proto' => $this->firstHeaderValue($request, 'X-Forwarded-Proto'),
            'forwarded_port' => $this->firstHeaderValue($request, 'X-Forwarded-Port'),
            'request_host' => $request->getHost(),
            'request_scheme' => $request->getScheme(),
            'method' => $request->getMethod(),
            'path' => '/'.$request->path(),
            'remote_addr' => $request->ip(),
        ];
    }

    private function shouldIgnore(array $reasons): bool
    {
        if (! app()->environment(['local', 'testing'])) {
            return $reasons === [];
        }

        return $reasons === [] || $this->containsOnlyMissingReasons($reasons);
    }

    /**
     * @param  list<string>  $reasons
     */
    private function containsOnlyMissingReasons(array $reasons): bool
    {
        return array_diff($reasons, ['missing_forwarded_host', 'missing_forwarded_proto']) === [];
    }

    private function firstHeaderValue(Request $request, string $name): ?string
    {
        $value = $request->headers->get($name);

        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return trim(explode(',', $value)[0]);
    }
}
