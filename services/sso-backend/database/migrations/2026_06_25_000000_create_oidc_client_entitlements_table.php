<?php

declare(strict_types=1);

use App\Support\Identity\StaffingRoles;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('oidc_client_entitlements', function (Blueprint $table): void {
            $table->id();
            $table->string('client_id', 63)->index();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('granted_at')->nullable();
            $table->timestamp('revoked_at')->nullable()->index();
            $table->string('granted_by_subject_id')->nullable();
            $table->string('revoked_by_subject_id')->nullable();
            $table->timestamps();

            $table->unique(['client_id', 'user_id']);
        });

        $this->backfillCurrentStaffingClients();
    }

    public function down(): void
    {
        Schema::dropIfExists('oidc_client_entitlements');
    }

    private function backfillCurrentStaffingClients(): void
    {
        $clientIds = $this->staffingClientIds();
        if ($clientIds === []) {
            return;
        }

        $now = now();
        $users = $this->staffingUserIds();

        foreach ($clientIds as $clientId) {
            foreach ($users as $userId) {
                DB::table('oidc_client_entitlements')->updateOrInsert(
                    ['client_id' => $clientId, 'user_id' => $userId],
                    [
                        'granted_at' => $now,
                        'revoked_at' => null,
                        'granted_by_subject_id' => 'migration',
                        'revoked_by_subject_id' => null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ],
                );
            }
        }
    }

    /**
     * Staff users, selected the same way EntitlementGuard::hasStaffingRole
     * recognizes them — both read the single StaffingRoles::SLUGS set, so the
     * backfill and the runtime guard can never drift. Selection spans the legacy
     * `users.role` column OR a staffing slug on the roles() relation; selecting
     * only the column (as the first cut did) leaves users whose staffing role
     * lives solely in the relation un-backfilled, so the fail-closed guard locks
     * them out of every staff app on deploy.
     *
     * @return Collection<int, int>
     */
    private function staffingUserIds(): Collection
    {
        $staffingRoles = StaffingRoles::SLUGS;

        $query = DB::table('users')->whereIn('role', $staffingRoles);

        if (Schema::hasTable('role_user') && Schema::hasTable('roles')) {
            $query->orWhereIn('id', function ($sub) use ($staffingRoles): void {
                $sub->select('role_user.user_id')
                    ->from('role_user')
                    ->join('roles', 'roles.id', '=', 'role_user.role_id')
                    ->whereIn('roles.slug', $staffingRoles);
            });
        }

        return $query->pluck('id');
    }

    /**
     * @return list<string>
     */
    private function staffingClientIds(): array
    {
        $clientIds = [];
        $configured = config('oidc_clients.clients', []);

        if (is_array($configured)) {
            foreach ($configured as $clientId => $client) {
                if (is_string($clientId) && is_array($client) && ($client['category'] ?? null) === 'kepegawaian') {
                    $clientIds[] = $clientId;
                }
            }
        }

        if (Schema::hasTable('oidc_client_registrations') && Schema::hasColumn('oidc_client_registrations', 'category')) {
            $dynamicIds = DB::table('oidc_client_registrations')
                ->where('status', 'active')
                ->where('category', 'kepegawaian')
                ->pluck('client_id')
                ->filter(fn (mixed $clientId): bool => is_string($clientId))
                ->all();

            $clientIds = array_merge($clientIds, $dynamicIds);
        }

        return array_values(array_unique($clientIds));
    }
};
