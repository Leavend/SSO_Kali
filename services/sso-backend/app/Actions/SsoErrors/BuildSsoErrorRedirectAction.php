<?php

declare(strict_types=1);

namespace App\Actions\SsoErrors;

use App\Support\SsoErrors\SsoErrorContext;

final class BuildSsoErrorRedirectAction
{
    public function __construct(private readonly ResolveSsoErrorMessageAction $messages) {}

    public function execute(SsoErrorContext $context, string $errorReference, string $path = '/login'): string
    {
        $baseUrl = rtrim((string) config('sso.frontend_url', config('app.url')), '/');
        $targetPath = '/'.ltrim($path, '/');
        $message = $this->messages->execute($context->code);
        $query = http_build_query([
            'error' => $context->code->value,
            'error_ref' => $errorReference,
            'title' => $message->title,
            'message' => $message->message,
            'action_label' => $message->actionLabel,
            'retry_allowed' => $message->retryAllowed ? '1' : ($context->retryAllowed ? '1' : '0'),
            'alternative_login_allowed' => $message->alternativeLoginAllowed ? '1' : ($context->alternativeLoginAllowed ? '1' : '0'),
        ]);

        return $baseUrl.$targetPath.'?'.$query;
    }
}
