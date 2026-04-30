<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? 'App B - Confidential Client' }}</title>
    <style>
        :root {
            --shell: #f4efe6;
            --panel: #fffaf1;
            --ink: #241b11;
            --muted: #6b5a47;
            --accent: #d97706;
            --accent-soft: rgba(217, 119, 6, 0.08);
            --accent-hover: #b45309;
            --line: rgba(107, 90, 71, 0.18);
            --shadow: rgba(36, 27, 17, 0.08);
        }

        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: "Instrument Sans", system-ui, sans-serif;
            background:
                radial-gradient(circle at 18% 0%, rgba(217, 119, 6, 0.14), transparent 26rem),
                radial-gradient(circle at 92% 20%, rgba(180, 83, 9, 0.08), transparent 24rem),
                linear-gradient(180deg, #f8f3ea 0%, var(--shell) 100%);
            color: var(--ink);
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
        }
        .shell { max-width: 1100px; margin: 0 auto; padding: 40px 24px 56px; }
        .panel {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 28px;
            box-shadow: 0 24px 70px var(--shadow);
            padding: 36px 32px;
        }
        .eyebrow {
            display: inline-flex;
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
            padding: 8px 14px;
            font-size: 12px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--accent);
            background: var(--accent-soft);
        }
        .title { font-size: clamp(1.8rem, 4vw, 3.2rem); line-height: 1.1; margin: 20px 0 0; font-weight: 700; letter-spacing: -0.01em; }
        .lede { max-width: 760px; color: var(--muted); font-size: 15px; line-height: 1.8; margin-top: 16px; }
        .status {
            margin-top: 18px;
            padding: 14px 16px;
            border-radius: 16px;
            border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
            background: var(--accent-soft);
            color: var(--accent);
            font-size: 14px;
            line-height: 1.6;
        }
        code {
            padding: 2px 7px;
            border-radius: 6px;
            font-size: 0.88em;
            font-family: "JetBrains Mono", ui-monospace, monospace;
            color: var(--accent);
            background: var(--accent-soft);
            border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
        }
        .grid { display: grid; gap: 14px; margin-top: 28px; }
        .grid.three { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .card {
            border: 1px solid var(--line);
            border-radius: 20px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.72);
            transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .card:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(36, 27, 17, 0.08); }
        .label { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0; font-weight: 600; }
        .value { margin-top: 10px; font-size: 0.94rem; line-height: 1.7; word-break: break-word; }
        .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; align-items: center; }
        .button, .ghost {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 14px;
            padding: 14px 22px;
            font-weight: 700;
            text-decoration: none;
            border: 1px solid transparent;
            cursor: pointer;
            font: inherit;
            font-size: 15px;
            transition: transform 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
        }
        .button { background: var(--accent); color: white; }
        .button:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(217, 119, 6, 0.28); background: var(--accent-hover); }
        .ghost { background: transparent; color: var(--ink); border-color: var(--line); }
        .ghost:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }

        @media (max-width: 640px) {
            .shell { padding: 24px 16px 40px; }
            .panel { padding: 28px 20px; border-radius: 22px; }
            .title { font-size: 1.6rem; }
            .grid.three { grid-template-columns: 1fr; }
            .actions { flex-direction: column; align-items: stretch; }
            .button, .ghost { width: 100%; text-align: center; }
        }
    </style>
</head>
<body>
    <main class="shell">
        @php($visibleStatus = session('status') ?? ($statusMessage ?? null))

        @if ($visibleStatus)
            <div class="status">{{ $visibleStatus }}</div>
        @endif

        @yield('content')
    </main>
</body>
</html>
