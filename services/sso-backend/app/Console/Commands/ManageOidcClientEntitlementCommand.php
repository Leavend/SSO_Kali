<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\OidcClientEntitlement;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

final class ManageOidcClientEntitlementCommand extends Command
{
    protected $signature = 'sso:client-entitlement
        {action : grant or revoke}
        {client_id : OIDC client id}
        {subject_id? : User subject id (omit when using --role)}
        {--role= : Apply to every user with this role slug instead of a single subject}
        {--actor=system : Actor subject id for audit metadata}';

    protected $description = 'Grant or revoke a user entitlement for a restricted OIDC client (single subject or whole role).';

    public function handle(): int
    {
        $action = (string) $this->argument('action');
        if (! in_array($action, ['grant', 'revoke'], true)) {
            $this->error('Action must be grant or revoke.');

            return self::FAILURE;
        }

        $role = $this->option('role');

        return is_string($role) && $role !== ''
            ? $this->applyToRole($action, $role)
            : $this->applyToSubject($action);
    }

    private function applyToSubject(string $action): int
    {
        $subjectId = $this->argument('subject_id');
        if (! is_string($subjectId) || $subjectId === '') {
            $this->error('Provide a subject_id, or use --role to target a whole role.');

            return self::FAILURE;
        }

        $user = User::query()->where('subject_id', $subjectId)->first();
        if (! $user instanceof User) {
            $this->error('User not found.');

            return self::FAILURE;
        }

        $this->apply($action, $user);
        $this->info('Client entitlement '.$action.'ed.');

        return self::SUCCESS;
    }

    private function applyToRole(string $action, string $role): int
    {
        $count = 0;

        $this->usersWithRole($role)->chunkById(500, function (Collection $users) use ($action, &$count): void {
            foreach ($users as $user) {
                $this->apply($action, $user);
                $count++;
            }
        });

        $this->info('Client entitlement '.$action.'ed for '.$count.' user(s) with role ['.$role.'].');

        return self::SUCCESS;
    }

    /**
     * @return Builder<User>
     */
    private function usersWithRole(string $role): Builder
    {
        return User::query()->where(function (Builder $query) use ($role): void {
            $query->where('role', $role)
                ->orWhereHas('roles', fn (Builder $roles) => $roles->where('slug', $role));
        });
    }

    private function apply(string $action, User $user): void
    {
        $clientId = (string) $this->argument('client_id');
        $actor = (string) $this->option('actor');

        $action === 'grant'
            ? OidcClientEntitlement::grant($clientId, $user, $actor)
            : OidcClientEntitlement::revoke($clientId, $user, $actor);
    }
}
