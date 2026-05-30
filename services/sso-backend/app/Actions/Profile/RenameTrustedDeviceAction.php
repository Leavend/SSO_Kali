<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Models\TrustedDevice;
use App\Services\Profile\ProfilePrincipalException;
use App\Services\Profile\ProfilePrincipalResolver;
use App\Services\Profile\TrustedDevicesService;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class RenameTrustedDeviceAction
{
    public function __construct(
        private readonly ProfilePrincipalResolver $principals,
        private readonly TrustedDevicesService $devices,
    ) {}

    public function handle(Request $request, int $deviceId): JsonResponse
    {
        $validated = $request->validate(['label' => ['required', 'string', 'max:80']]);

        try {
            $principal = $this->principals->resolve($request);
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }

        $device = $this->devices->rename((string) $principal['claims']['sub'], $deviceId, (string) $validated['label']);
        if (! $device instanceof TrustedDevice) {
            return OidcErrorResponse::json('device_not_found', 'Device does not belong to this user.', 404);
        }

        return response()->json(['device' => ['id' => $device->id, 'label' => $device->label]])
            ->withHeaders(['Cache-Control' => 'no-store, no-cache, must-revalidate, private', 'Pragma' => 'no-cache']);
    }
}
