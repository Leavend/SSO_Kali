<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Services\Profile\ProfilePrincipalException;
use App\Services\Profile\ProfilePrincipalResolver;
use App\Services\Profile\TrustedDevicesService;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ListTrustedDevicesAction
{
    public function __construct(
        private readonly ProfilePrincipalResolver $principals,
        private readonly TrustedDevicesService $devices,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        try {
            $principal = $this->principals->resolve($request);
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }

        return response()->json([
            'devices' => $this->devices->listForSubject((string) $principal['claims']['sub']),
        ])->withHeaders($this->headers());
    }

    /** @return array<string, string> */
    private function headers(): array
    {
        return ['Cache-Control' => 'no-store, no-cache, must-revalidate, private', 'Pragma' => 'no-cache'];
    }
}
