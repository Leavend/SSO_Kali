<?php

declare(strict_types=1);

namespace Tests\Unit\Models;

use App\Models\User;
use Illuminate\Support\Carbon;
use Tests\TestCase;

final class UserEffectiveStatusTest extends TestCase
{
    public function test_is_locked_when_locked_at_is_null(): void
    {
        $user = new User();
        $user->locked_at = null;
        $user->locked_until = null;

        self::assertFalse($user->isLocked());
    }

    public function test_is_locked_when_locked_at_is_set_and_locked_until_is_null(): void
    {
        $user = new User();
        $user->locked_at = Carbon::now();
        $user->locked_until = null;

        self::assertTrue($user->isLocked());
    }

    public function test_is_locked_when_locked_until_is_in_the_future(): void
    {
        $user = new User();
        $user->locked_at = Carbon::now();
        $user->locked_until = Carbon::now()->addHour();

        self::assertTrue($user->isLocked());
    }

    public function test_is_locked_when_locked_until_is_in_the_past(): void
    {
        $user = new User();
        $user->locked_at = Carbon::now()->subHours(2);
        $user->locked_until = Carbon::now()->subHour();

        self::assertFalse($user->isLocked());
    }

    public function test_effective_status_precedence_when_disabled(): void
    {
        $user = new User();
        $user->status = 'disabled';
        $user->locked_at = Carbon::now();
        $user->locked_until = null;

        self::assertEquals('disabled', $user->effective_status);
    }

    public function test_effective_status_precedence_when_deactivated(): void
    {
        $user = new User();
        $user->status = 'deactivated';
        $user->locked_at = Carbon::now();
        $user->locked_until = null;

        self::assertEquals('deactivated', $user->effective_status);
    }

    public function test_effective_status_precedence_when_active_and_locked(): void
    {
        $user = new User();
        $user->status = 'active';
        $user->locked_at = Carbon::now();
        $user->locked_until = null;

        self::assertEquals('locked', $user->effective_status);
    }

    public function test_effective_status_precedence_when_active_and_not_locked(): void
    {
        $user = new User();
        $user->status = 'active';
        $user->locked_at = null;
        $user->locked_until = null;

        self::assertEquals('active', $user->effective_status);
    }

    public function test_effective_status_precedence_when_status_is_null_and_not_locked(): void
    {
        $user = new User();
        $user->status = '';
        $user->locked_at = null;
        $user->locked_until = null;

        self::assertEquals('active', $user->effective_status);
    }
}
