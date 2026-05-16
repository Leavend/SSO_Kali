<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Support\Oidc\OidcErrorCatalog;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Routing\Exceptions\InvalidSignatureException;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

/**
 * BE-FR062-001 — global OIDC/admin exception renderer.
 *
 * Even when downstream code forgets to wrap a path in a try/catch, the
 * global handler will resolve the response through the central catalog so
 * the wire never leaks raw exception text. Routes outside the OIDC/admin
 * scope retain Laravel's default rendering so HTML web pages keep their
 * usual error views.
 *
 * The renderer is wired in `bootstrap/app.php` via
 * `$exceptions->renderable(SafeOidcExceptionRenderer::class)` and only
 * activates for JSON / OIDC redirect-capable requests.
 */
final class SafeOidcExceptionRenderer
{
    /**
     * @var list<string>
     */
    private const HANDLED_PREFIXES = [
        'oauth/',
        'connect/',
        'userinfo',
        '.well-known/',
        'admin/api/',
        'api/',
    ];

    public function __invoke(Throwable $exception, Request $request): ?Response
    {
        if (! $this->shouldHandle($request)) {
            return null;
        }

        if ($exception instanceof ValidationException) {
            return null; // Let Laravel render structured 422 with field errors.
        }

        // HttpResponseException carries an already-built response (used by
        // throttle middleware). Honor its status when mapping into the
        // catalog so 429 stays 429 instead of becoming a generic 500.
        $httpResponse = $exception instanceof HttpResponseException ? $exception->getResponse() : null;

        $error = $this->resolveErrorCode($exception, $httpResponse);
        $status = $httpResponse !== null
            ? $httpResponse->getStatusCode()
            : ($exception instanceof HttpExceptionInterface
                ? $exception->getStatusCode()
                : OidcErrorCatalog::status($error));

        // Log full exception once so operators can correlate via X-Request-Id.
        Log::warning('[SAFE_OIDC_EXCEPTION_RENDERED]', [
            'error_code' => $error,
            'status' => $status,
            'path' => $request->path(),
            'method' => $request->method(),
            'request_id' => $request->headers->get('X-Request-Id'),
            'exception_class' => $exception::class,
            'exception_message_hash' => hash('sha256', $exception->getMessage()),
        ]);

        return OidcErrorResponse::json(
            error: $error,
            description: null,
            status: $status,
            errorRef: null,
            requestId: $request->headers->get('X-Request-Id'),
            exception: $exception,
        );
    }

    private function shouldHandle(Request $request): bool
    {
        // Authorization endpoint is HTML/redirect-driven by RFC 6749. Letting
        // the framework redirect unauthenticated users to /login keeps the
        // existing browser flow intact; only API/JSON callers go through the
        // safe renderer.
        if ($request->expectsJson()) {
            return true;
        }

        $path = ltrim($request->path(), '/');

        if (str_starts_with($path, 'oauth/authorize') || str_starts_with($path, 'connect/logout')) {
            return false;
        }

        foreach (self::HANDLED_PREFIXES as $prefix) {
            if (str_starts_with($path, $prefix)) {
                return true;
            }
        }

        return false;
    }

    private function resolveErrorCode(Throwable $exception, ?Response $httpResponse = null): string
    {
        if ($httpResponse !== null && $httpResponse->getStatusCode() === 429) {
            return 'too_many_attempts';
        }

        return match (true) {
            $exception instanceof ThrottleRequestsException => 'too_many_attempts',
            $exception instanceof AuthenticationException => 'invalid_token',
            $exception instanceof AuthorizationException => 'access_denied',
            $exception instanceof TokenMismatchException => 'invalid_request',
            $exception instanceof InvalidSignatureException => 'invalid_request',
            $exception instanceof ModelNotFoundException => 'not_found',
            $exception instanceof NotFoundHttpException => 'not_found',
            default => 'server_error',
        };
    }
}
