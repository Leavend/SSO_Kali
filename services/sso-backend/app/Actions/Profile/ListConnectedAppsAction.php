<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Services\Profile\ConnectedAppsService;
use App\Services\Profile\ProfilePrincipalException;
use App\Services\Profile\ProfilePrincipalResolver;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ListConnectedAppsAction
{
    public function __construct(
        private readonly ProfilePrincipalResolver $principals,
        private readonly ConnectedAppsService $apps,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        try {
            $principal = $this->principals->resolve($request);
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }

        return response()->json([
            'connected_apps' => $this->apps->listForSubject((string) $principal['claims']['sub']),
        ])->withHeaders([
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }
}
