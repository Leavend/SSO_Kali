<?php

declare(strict_types=1);

namespace App\Support\Oidc;

/**
 * BE-FR023-001 — Outcome of an OIDC authorization continuation.
 *
 * Used by `CompletePendingOidcAuthorization` so callers can distinguish
 * between a code/consent redirect, a structurally invalid pending
 * context, a registry change, and an invalid_scope policy failure.
 */
enum OidcContinuationOutcome: string
{
    case AuthorizationCode = 'authorization_code';
    case Consent = 'consent';
    case InvalidContext = 'invalid_context';
    case InvalidClient = 'invalid_client';
    case InvalidScope = 'invalid_scope';
    case TemporarilyUnavailable = 'temporarily_unavailable';
}
