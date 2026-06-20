<?php

declare(strict_types=1);

use App\Services\Admin\SupportReference;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('login_contexts', function (Blueprint $table): void {
            $table->index(['subject_id', 'id'], 'login_contexts_subject_id_id_idx');
        });

        Schema::table('sso_sessions', function (Blueprint $table): void {
            $table->index(['subject_id', 'revoked_at', 'expires_at'], 'sso_sessions_subject_active_idx');
        });

        Schema::table('mfa_credentials', function (Blueprint $table): void {
            $table->index(['user_id', 'verified_at'], 'mfa_credentials_user_verified_idx');
        });

        Schema::table('admin_audit_events', function (Blueprint $table): void {
            $table->string('request_id', 128)->nullable()->after('context')->index('admin_audit_events_request_id_idx');
            $table->string('support_reference', 64)->nullable()->after('request_id')->index('admin_audit_events_support_ref_idx');
            $table->string('subject_id', 128)->nullable()->after('support_reference')->index('admin_audit_events_subject_id_idx');
            $table->string('target_subject_id', 128)->nullable()->after('subject_id')->index('admin_audit_events_target_subject_id_idx');
            $table->string('client_id', 128)->nullable()->after('target_subject_id')->index('admin_audit_events_client_id_idx');
            $table->string('session_id', 128)->nullable()->after('client_id')->index('admin_audit_events_session_id_idx');
        });

        $this->backfillAdminAuditCorrelationColumns();
    }

    public function down(): void
    {
        Schema::table('admin_audit_events', function (Blueprint $table): void {
            $table->dropIndex('admin_audit_events_session_id_idx');
            $table->dropIndex('admin_audit_events_client_id_idx');
            $table->dropIndex('admin_audit_events_target_subject_id_idx');
            $table->dropIndex('admin_audit_events_subject_id_idx');
            $table->dropIndex('admin_audit_events_support_ref_idx');
            $table->dropIndex('admin_audit_events_request_id_idx');
            $table->dropColumn([
                'request_id',
                'support_reference',
                'subject_id',
                'target_subject_id',
                'client_id',
                'session_id',
            ]);
        });

        Schema::table('mfa_credentials', function (Blueprint $table): void {
            $table->dropIndex('mfa_credentials_user_verified_idx');
        });

        Schema::table('sso_sessions', function (Blueprint $table): void {
            $table->dropIndex('sso_sessions_subject_active_idx');
        });

        Schema::table('login_contexts', function (Blueprint $table): void {
            $table->dropIndex('login_contexts_subject_id_id_idx');
        });
    }

    private function backfillAdminAuditCorrelationColumns(): void
    {
        DB::table('admin_audit_events')
            ->select(['id', 'context'])
            ->orderBy('id')
            ->chunkById(500, function ($events): void {
                foreach ($events as $event) {
                    $context = $this->context($event->context);
                    DB::table('admin_audit_events')
                        ->where('id', $event->id)
                        ->update($this->correlationColumns($context));
                }
            });
    }

    /**
     * @return array<string, mixed>
     */
    private function context(mixed $context): array
    {
        if (is_array($context)) {
            return $context;
        }

        if (! is_string($context) || $context === '') {
            return [];
        }

        $decoded = json_decode($context, true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, string|null>
     */
    private function correlationColumns(array $context): array
    {
        $requestId = $this->stringValue($context, 'request_id');

        return [
            'request_id' => $requestId,
            'support_reference' => $this->stringValue($context, 'support_reference') ?? SupportReference::fromRequestId($requestId),
            'subject_id' => $this->stringValue($context, 'subject_id'),
            'target_subject_id' => $this->stringValue($context, 'target_subject_id'),
            'client_id' => $this->stringValue($context, 'client_id'),
            'session_id' => $this->stringValue($context, 'session_id'),
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function stringValue(array $context, string $key): ?string
    {
        $value = $context[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }
};
