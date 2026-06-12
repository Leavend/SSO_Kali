<x-mail::layout>
{{-- Header --}}
<x-slot:header>
<x-mail::header :url="config('app.url')">
{{ config('app.name') }}
</x-mail::header>
</x-slot:header>

{{-- Body --}}
{!! $slot !!}

{{-- Subcopy --}}
@isset($subcopy)
<x-slot:subcopy>
<x-mail::subcopy>
{!! $subcopy !!}
</x-mail::subcopy>
</x-slot:subcopy>
@endisset

{{-- Footer --}}
<x-slot:footer>
<x-mail::footer>
**Dev-SSO** · {{ config('security-notifications.support_address', config('mail.from.address')) }}

Email ini dikirim karena aktivitas pada akun Anda. Jangan pernah membagikan password, OTP, atau recovery code melalui email.
</x-mail::footer>
</x-slot:footer>
</x-mail::layout>
