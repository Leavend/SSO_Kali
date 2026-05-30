<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Services\Profile\ProfilePrincipalException;
use App\Services\Profile\ProfilePrincipalResolver;
use App\Services\Profile\TrustedDevicesService;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class RevokeTrustedDeviceAction
{
    public function __construct(
        private readonly ProfilePrincipalResolver $principals,
        private readonly TrustedDevicesService $devices,
    ) {}

    public function handle(Request $request, int $deviceId): JsonResponse
    {
        try {
            $principal = $this->principals->resolve($request);
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }

        if (! $this->devices->revoke((string) $principal['claims']['sub'], $deviceId)) {
            return OidcErrorResponse::json('device_not_found', 'Device does not belong to this user.', 404);
        }

        return response()->json(['device_id' => $deviceId, 'revoked' => true])
            ->withHeaders(['Cache-Control' => 'no-store, no-cache, must-revalidate, private', 'Pragma' => 'no-cache']);
    }
}
