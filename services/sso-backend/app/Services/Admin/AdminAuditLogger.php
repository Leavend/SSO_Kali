<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

final class AdminAuditLogger
{
    public function __construct(
        private readonly AdminAuditEventStore $store,
    ) {}

    /**
     * @param  array<string, mixed>  $context
     */
    public function denied(
        string $action,
        Request $request,
        ?User $admin,
        string $reason,
        array $context = [],
        ?string $taxonomy = null,
    ): void {
        $this->write('denied', $action, $request, $admin, [
            'reason' => $reason,
            ...$context,
        ], $taxonomy);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function succeeded(
        string $action,
        Request $request,
        User $admin,
        array $context = [],
        ?string $taxonomy = null,
    ): void {
        $this->write('succeeded', $action, $request, $admin, $context, $taxonomy);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function failed(
        string $action,
        Request $request,
        User $admin,
        Throwable $exception,
        array $context = [],
        ?string $taxonomy = null,
    ): void {
        $this->write('failed', $action, $request, $admin, [
            'error' => $exception->getMessage(),
            'exception' => $exception::class,
            ...$context,
        ], $taxonomy);
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function payload(
        string $action,
        Request $request,
        ?User $admin,
        array $context,
        ?string $taxonomy,
    ): array {
        return [
            'action' => $action,
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'taxonomy' => $taxonomy,
            'admin_email' => $admin?->email,
            'admin_role' => $admin?->role,
            'admin_subject_id' => $admin?->subject_id,
            'reason' => is_string($context['reason'] ?? null) ? $context['reason'] : null,
            'context' => $context,
            'occurred_at' => now(),
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function write(
        string $outcome,
        string $action,
        Request $request,
        ?User $admin,
        array $context,
        ?string $taxonomy = null,
    ): void {
        $payload = $this->payload($action, $request, $admin, $context, $taxonomy);

        $this->store->append([
            ...$payload,
            'outcome' => $outcome,
        ]);

        Log::log($this->level($outcome), $this->marker($outcome), [
            ...$context,
            'action' => $payload['action'],
            'method' => $payload['method'],
            'path' => $payload['path'],
            'ip' => $payload['ip_address'],
            'taxonomy' => $payload['taxonomy'],
            'admin_email' => $payload['admin_email'],
            'admin_role' => $payload['admin_role'],
            'admin_subject_id' => $payload['admin_subject_id'],
            'timestamp' => $payload['occurred_at']->toIso8601String(),
        ]);
    }

    private function marker(string $outcome): string
    {
        return match ($outcome) {
            'denied' => '[ADMIN_AUDIT_DENIED]',
            'failed' => '[ADMIN_AUDIT_FAILED]',
            default => '[ADMIN_AUDIT_SUCCESS]',
        };
    }

    private function level(string $outcome): string
    {
        return match ($outcome) {
            'denied' => 'warning',
            'failed' => 'error',
            default => 'info',
        };
    }
}
