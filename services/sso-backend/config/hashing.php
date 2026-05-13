<?php

declare(strict_types=1);

/**
 * FR-015: Hashing configuration — Argon2id mandatory.
 *
 * OWASP recommended parameters for Argon2id:
 * - memory: 65536 KB (64 MB)
 * - time: 4 iterations
 * - threads: 1 (parallelism)
 *
 * Existing bcrypt hashes auto-rehash on next login via Hash::needsRehash().
 */
return [

    'driver' => 'argon2id',

    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => true,
    ],

    'argon' => [
        'memory' => 65536,
        'threads' => 1,
        'time' => 4,
        'verify' => true,
    ],

    'rehash_on_login' => true,

];
