<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown when role management actions are denied or fail.
 * The message is user-facing and should be returned to the client.
 */
final class RoleManagementException extends RuntimeException {}
