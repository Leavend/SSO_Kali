<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Requests\Admin\StoreIpAccessRuleRequest;
use App\Models\IpAccessRule;
use App\Services\Admin\AdminAuditLogger;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class IpAccessRuleController
{
    public function __construct(private readonly AdminAuditLogger $audit) {}

    public function index(): JsonResponse
    {
        return AdminApiResponse::ok([
            'rules' => IpAccessRule::query()->orderByDesc('created_at')->get()->all(),
        ]);
    }

    public function store(StoreIpAccessRuleRequest $request): JsonResponse
    {
        $admin = $request->attributes->get('admin_user');

        $rule = IpAccessRule::create([
            'cidr' => $request->validated('cidr'),
            'mode' => $request->validated('mode'),
            'reason' => $request->validated('reason'),
            'expires_at' => $request->validated('expires_at'),
            'actor_subject_id' => $admin?->subject_id,
        ]);

        $this->audit->succeeded(
            'create_ip_access_rule',
            $request,
            $admin,
            ['ip_access_rule_id' => $rule->id, 'cidr' => $rule->cidr, 'mode' => $rule->mode],
        );

        return AdminApiResponse::created(['rule' => $rule]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $rule = IpAccessRule::query()->find($id);

        if ($rule === null) {
            return AdminApiResponse::error('not_found', 'IP access rule not found.', 404);
        }

        $admin = $request->attributes->get('admin_user');

        $this->audit->succeeded(
            'delete_ip_access_rule',
            $request,
            $admin,
            ['ip_access_rule_id' => $id, 'cidr' => $rule->cidr, 'mode' => $rule->mode],
        );

        $rule->delete();

        return AdminApiResponse::noContent();
    }
}
