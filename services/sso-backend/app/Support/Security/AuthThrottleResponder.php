<?php

declare(strict_types=1);

namespace App\Support\Security;

use App\Services\Oidc\AuthRequestStore;
use App\Support\Oidc\SsoAuthFlowCookie;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class AuthThrottleResponder
{
    public function __construct(
        private readonly AuthRequestStore $authRequests,
        private readonly SsoAuthFlowCookie $authFlowCookie,
    ) {}

    /**
     * @param  array<string, mixed>  $headers
     */
    public function adminApi(array $headers): JsonResponse
    {
        $payload = [
            'error' => 'too_many_attempts',
            'error_description' => $this->message(),
        ];

        $retryAfter = $this->retryAfter($headers);

        if ($retryAfter !== null) {
            $payload['retry_after'] = $retryAfter;
        }

        return response()->json($payload, 429, $headers);
    }

    /**
     * @param  array<string, mixed>  $headers
     */
    public function authorize(Request $request, array $headers): Response
    {
        $redirectUri = $this->validatedRedirectUri((string) $request->query('redirect_uri', ''));
        $state = $this->stringOrNull($request->query('state'));

        if ($redirectUri === null) {
            return $this->adminApi($headers);
        }

        return $this->withHeaders(
            OidcErrorResponse::redirect($redirectUri, 'too_many_attempts', $this->message(), $state),
            $headers,
        );
    }

    /**
     * @param  array<string, mixed>  $headers
     */
    public function callback(Request $request, array $headers): Response
    {
        $context = $this->callbackContext($request);

        if ($context === null) {
            return $this->adminApi($headers);
        }

        $response = OidcErrorResponse::redirect(
            $context['redirect_uri'],
            'too_many_attempts',
            $this->message(),
            $context['original_state'],
        )->withCookie($this->authFlowCookie->expire());

        return $this->withHeaders($response, $headers);
    }

    private function message(): string
    {
        return 'Too many attempts were detected. Please wait a moment before trying again.';
    }

    /**
     * @param  array<string, mixed>  $headers
     */
    private function retryAfter(array $headers): ?int
    {
        $retryAfter = $headers['Retry-After'] ?? $headers['retry-after'] ?? null;

        return is_numeric($retryAfter) ? (int) $retryAfter : null;
    }

    /**
     * @param  array<string, mixed>  $headers
     */
    private function withHeaders(Response $response, array $headers): Response
    {
        $response->headers->add($headers);

        return $response;
    }

    /**
     * @return array{redirect_uri: string, original_state: ?string}|null
     */
    private function callbackContext(Request $request): ?array
    {
        $state = $this->stringOrNull($request->query('state'));

        if ($state !== null) {
            $context = $this->authRequests->peek($state);
            $resolved = $this->resolvedContext($context);

            if ($resolved !== null) {
                return $resolved;
            }
        }

        return $this->authFlowCookie->read($request);
    }

    /**
     * @param  array<string, mixed>|null  $context
     * @return array{redirect_uri: string, original_state: ?string}|null
     */
    private function resolvedContext(?array $context): ?array
    {
        if (! is_array($context)) {
            return null;
        }

        $redirectUri = $this->validatedRedirectUri((string) ($context['redirect_uri'] ?? ''));

        if ($redirectUri === null) {
            return null;
        }

        return [
            'redirect_uri' => $redirectUri,
            'original_state' => is_string($context['original_state'] ?? null)
                ? $context['original_state']
                : null,
        ];
    }

    private function validatedRedirectUri(string $redirectUri): ?string
    {
        return filter_var($redirectUri, FILTER_VALIDATE_URL) !== false
            ? $redirectUri
            : null;
    }

    private function stringOrNull(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
