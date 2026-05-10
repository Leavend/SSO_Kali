<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\SsoErrors\ManageSsoErrorTemplateAction;
use App\Http\Requests\Admin\UpsertSsoErrorTemplateRequest;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SsoErrorTemplateController
{
    public function __construct(private readonly ManageSsoErrorTemplateAction $templates) {}

    public function index(): JsonResponse
    {
        return AdminApiResponse::ok(['templates' => $this->templates->list()]);
    }

    public function show(Request $request, string $errorCode): JsonResponse
    {
        $template = $this->templates->show($errorCode, $this->locale($request));

        return $template === null
            ? AdminApiResponse::error('not_found', 'SSO error template not found.', 404)
            : AdminApiResponse::ok(['template' => $template]);
    }

    public function update(UpsertSsoErrorTemplateRequest $request, string $errorCode): JsonResponse
    {
        $template = $this->templates->update(
            $errorCode,
            $request->validated(),
            $request->user()?->getAuthIdentifier(),
        );

        return $template === null
            ? AdminApiResponse::error('not_found', 'SSO error template not found.', 404)
            : AdminApiResponse::ok(['template' => $template]);
    }

    public function reset(Request $request, string $errorCode): JsonResponse
    {
        $template = $this->templates->reset(
            $errorCode,
            $this->locale($request),
            $request->user()?->getAuthIdentifier(),
        );

        return $template === null
            ? AdminApiResponse::error('not_found', 'SSO error template not found.', 404)
            : AdminApiResponse::ok(['template' => $template]);
    }

    private function locale(Request $request): string
    {
        $locale = $request->input('locale', $request->query('locale', 'id'));

        return is_string($locale) ? $locale : 'id';
    }
}
