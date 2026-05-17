<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Actions\Profile\ConfirmEmailChangeAction;
use App\Actions\Profile\ConfirmPhoneChangeAction;
use App\Actions\Profile\RequestEmailChangeAction;
use App\Actions\Profile\RequestPhoneChangeAction;
use App\Http\Requests\Profile\ConfirmEmailChangeRequest;
use App\Http\Requests\Profile\ConfirmPhoneChangeRequest;
use App\Http\Requests\Profile\RequestEmailChangeRequest;
use App\Http\Requests\Profile\RequestPhoneChangeRequest;
use Illuminate\Http\JsonResponse;

final class ProfileChangeController
{
    public function requestEmail(RequestEmailChangeRequest $request, RequestEmailChangeAction $action): JsonResponse
    {
        return response()->json(['request' => $action->execute(
            $request,
            (string) $request->validated('new_email'),
            (string) $request->validated('current_password'),
        )])->header('Cache-Control', 'no-store');
    }

    public function confirmEmail(ConfirmEmailChangeRequest $request, ConfirmEmailChangeAction $action): JsonResponse
    {
        return response()->json(['profile' => $action->execute(
            $request,
            (string) $request->validated('token'),
        )])->header('Cache-Control', 'no-store');
    }

    public function requestPhone(RequestPhoneChangeRequest $request, RequestPhoneChangeAction $action): JsonResponse
    {
        return response()->json(['request' => $action->execute(
            $request,
            (string) $request->validated('new_phone'),
            (string) $request->validated('current_password'),
        )])->header('Cache-Control', 'no-store');
    }

    public function confirmPhone(ConfirmPhoneChangeRequest $request, ConfirmPhoneChangeAction $action): JsonResponse
    {
        return response()->json(['profile' => $action->execute(
            $request,
            (string) $request->validated('otp'),
        )])->header('Cache-Control', 'no-store');
    }
}
