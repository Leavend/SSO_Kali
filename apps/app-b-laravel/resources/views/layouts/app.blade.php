<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? 'Dummy App B' }}</title>
    <style>
        :root {
            --shell: #f4efe6;
            --panel: #fffaf1;
            --ink: #241b11;
            --muted: #6b5a47;
            --accent: #d97706;
            --line: rgba(107, 90, 71, 0.18);
        }

        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: "Instrument Sans", system-ui, sans-serif;
            background:
                radial-gradient(circle at top left, rgba(217, 119, 6, 0.16), transparent 24rem),
                linear-gradient(180deg, #f8f3ea 0%, var(--shell) 100%);
            color: var(--ink);
        }
        .shell { max-width: 1100px; margin: 0 auto; padding: 32px 24px 56px; }
        .panel {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 32px;
            box-shadow: 0 24px 70px rgba(36, 27, 17, 0.08);
            padding: 32px;
        }
        .eyebrow {
            display: inline-flex;
            border-radius: 999px;
            border: 1px solid var(--line);
            padding: 8px 14px;
            font-size: 12px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: var(--accent);
        }
        .title { font-size: clamp(2.4rem, 4vw, 4.6rem); line-height: 1.02; margin: 20px 0 0; }
        .lede { max-width: 760px; color: var(--muted); font-size: 1rem; line-height: 1.8; margin-top: 16px; }
        .status {
            margin-top: 18px;
            padding: 14px 16px;
            border-radius: 20px;
            border: 1px solid var(--line);
            background: rgba(217, 119, 6, 0.08);
            color: var(--accent);
        }
        .grid { display: grid; gap: 16px; margin-top: 28px; }
        .grid.three { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .card { border: 1px solid var(--line); border-radius: 24px; padding: 18px; background: rgba(255, 255, 255, 0.72); }
        .label { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
        .value { margin-top: 10px; font-size: 0.96rem; line-height: 1.7; word-break: break-word; }
        .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
        .button, .ghost {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 14px 20px;
            font-weight: 700;
            text-decoration: none;
            border: 1px solid transparent;
            cursor: pointer;
            font: inherit;
        }
        .button { background: var(--accent); color: white; }
        .ghost { background: transparent; color: var(--ink); border-color: var(--line); }
    </style>
</head>
<body>
    <main class="shell">
        @if (session('status'))
            <div class="status">{{ session('status') }}</div>
        @endif

        @yield('content')
    </main>
</body>
</html>
