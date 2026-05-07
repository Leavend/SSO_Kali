<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Authorize SSO Client</title>
</head>
<body>
<form method="post" action="/oauth/authorize">
    <input type="hidden" name="auth_token" value="{{ $authToken }}">
    <button type="submit">Authorize {{ $client->name }}</button>
</form>
</body>
</html>
