<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Services\Profile\ProfilePrincipalException;
use App\Services\Profile\ProfilePrincipalResolver;
use App\Services\Profile\UserSessionsService;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ListUserSessionsAction
{
    public function __construct(
        private readonly ProfilePrincipalResolver $principals,
        private readonly UserSessionsService $sessions,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        try {
            $principal = $this->principals->resolve($request);
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }

        return response()->json([
            'sessions' => $this->sessions->listForSubject((string) $principal['claims']['sub']),
        ])->withHeaders([
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }
}
