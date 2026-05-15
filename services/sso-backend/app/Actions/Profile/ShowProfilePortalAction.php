<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Services\Profile\ProfilePortalPresenter;
use App\Services\Profile\ProfilePrincipalException;
use App\Services\Profile\ProfilePrincipalResolver;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ShowProfilePortalAction
{
    public function __construct(
        private readonly ProfilePrincipalResolver $principals,
        private readonly ProfilePortalPresenter $profiles,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        try {
            $principal = $this->principals->resolve($request);
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }

        return $this->noStore(response()->json(
            $this->profiles->present($principal['user'], $principal['claims']),
        ));
    }

    private function noStore(JsonResponse $response): JsonResponse
    {
        return $response->withHeaders([
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }
}
