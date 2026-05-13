<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\MfaCredential;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MfaCredential>
 */
final class MfaCredentialFactory extends Factory
{
    protected $model = MfaCredential::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'method' => 'totp',
            'secret' => $this->faker->regexify('[A-Z2-7]{32}'),
            'algorithm' => 'sha1',
            'digits' => 6,
            'period' => 30,
            'verified_at' => null,
            'last_used_at' => null,
        ];
    }

    public function totp(): static
    {
        return $this->state(['method' => 'totp']);
    }

    public function verified(): static
    {
        return $this->state(['verified_at' => now()]);
    }

    public function pending(): static
    {
        return $this->state(['verified_at' => null]);
    }
}
