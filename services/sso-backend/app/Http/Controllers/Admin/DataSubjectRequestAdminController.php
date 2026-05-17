<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\DataSubject\FulfillDataSubjectRequestAction;
use App\Actions\DataSubject\ReviewDataSubjectRequestAction;
use App\Http\Requests\DataSubject\FulfillDataSubjectRequestRequest;
use App\Http\Requests\DataSubject\ListDataSubjectRequestsRequest;
use App\Http\Requests\DataSubject\ReviewDataSubjectRequestRequest;
use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\DataSubject\AdminDataSubjectRequestPresenter;
use App\Services\DataSubject\DataSubjectRequestService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class DataSubjectRequestAdminController
{
    public function __construct(
        private readonly DataSubjectRequestService $service,
        private readonly AdminDataSubjectRequestPresenter $presenter,
    ) {}

    public function index(ListDataSubjectRequestsRequest $request): JsonResponse
    {
        $rows = $this->service->listing($request->validated())
            ->limit(100)
            ->get()
            ->map(fn (Model $model): array => $this->presentModel($model))
            ->all();

        return response()->json(['requests' => $rows])->header('Cache-Control', 'no-store');
    }

    public function review(
        ReviewDataSubjectRequestRequest $request,
        string $requestId,
        ReviewDataSubjectRequestAction $review,
    ): JsonResponse {
        $dataSubjectRequest = $review->execute(
            $requestId,
            $this->reviewer($request),
            (string) $request->validated('decision'),
            $this->optionalString($request->validated('notes')),
            $request,
        );

        return response()->json(['request' => $this->presenter->present($dataSubjectRequest)])
            ->header('Cache-Control', 'no-store');
    }

    public function fulfill(
        FulfillDataSubjectRequestRequest $request,
        string $requestId,
        FulfillDataSubjectRequestAction $fulfill,
    ): JsonResponse {
        $result = $fulfill->execute(
            $requestId,
            $this->reviewer($request),
            $request,
            (bool) ($request->validated('dry_run') ?? false),
        );

        return response()->json($result)->header('Cache-Control', 'no-store');
    }

    /**
     * @return array<string, mixed>
     */
    private function presentModel(Model $model): array
    {
        \assert($model instanceof DataSubjectRequest);

        return $this->presenter->present($model);
    }

    private function reviewer(Request $request): User
    {
        /** @var User $admin */
        $admin = $request->attributes->get('admin_user') ?? $request->user();

        return $admin;
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
