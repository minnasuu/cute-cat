/**
 * iframe srcDoc：Tailwind + React 18 UMD + Babel + 用户 JSX。
 * 用户源码经 JSON.stringify 后放入脚本，并把 </ 写成 \\u003c/ 避免打断 <script>。
 */
export function embedStringForHtmlScriptLiteral(value: string): string {
  return JSON.stringify(value).replace(/<\//g, "\\u003c/");
}

export function buildReactSandboxSrcDoc(
  userCode: string,
  sandboxUiScriptSrc: string,
): string {
  const userLiteral = embedStringForHtmlScriptLiteral(userCode);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>预览</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            border: 'hsl(var(--border))',
            input: 'hsl(var(--input))',
            ring: 'hsl(var(--ring))',
            background: 'hsl(var(--background))',
            foreground: 'hsl(var(--foreground))',
            primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
            secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
            destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
            muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
            accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
            popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
            card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
          },
          borderRadius: {
            lg: 'var(--radius)',
            md: 'calc(var(--radius) - 2px)',
            sm: 'calc(var(--radius) - 4px)',
          },
        },
      },
    };
  </script>
  <style>
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
      --card: 0 0% 100%;
      --card-foreground: 222.2 84% 4.9%;
      --popover: 0 0% 100%;
      --popover-foreground: 222.2 84% 4.9%;
      --primary: 142 76% 36%;
      --primary-foreground: 0 0% 98%;
      --secondary: 210 40% 96.1%;
      --secondary-foreground: 222.2 47.4% 11.2%;
      --muted: 210 40% 96.1%;
      --muted-foreground: 215.4 16.3% 46.9%;
      --accent: 210 40% 96.1%;
      --accent-foreground: 222.2 47.4% 11.2%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 0 0% 98%;
      --border: 214.3 31.8% 91.4%;
      --input: 214.3 31.8% 91.4%;
      --ring: 142 76% 36%;
      --radius: 1rem;
    }
    html, body, #root { height: 100%; margin: 0; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: hsl(var(--background)); color: hsl(var(--foreground)); }
  </style>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="${sandboxUiScriptSrc}"></script>
  <script crossorigin src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script>
    (function () {
      var UI = window.UI;
      if (!UI) {
        document.getElementById('root').innerHTML = '<p style="padding:16px;color:#b91c1c">预置组件库未加载（sandbox-ui.iife.js）</p>';
        return;
      }
      var userSource = ${userLiteral};
      try {
        var transformed = Babel.transform(userSource, {
          presets: [['react', { runtime: 'classic', pragma: 'React.createElement', pragmaFrag: 'React.Fragment' }]],
        }).code;
        var runner = new Function(
          'React',
          'ReactDOM',
          'UI',
          [
            'var cn = UI.cn;',
            'var Button = UI.Button;',
            'var Card = UI.Card;',
            'var CardHeader = UI.CardHeader;',
            'var CardFooter = UI.CardFooter;',
            'var CardTitle = UI.CardTitle;',
            'var CardDescription = UI.CardDescription;',
            'var CardContent = UI.CardContent;',
            'var Badge = UI.Badge;',
            'var Separator = UI.Separator;',
            'var buttonVariants = UI.buttonVariants;',
            'var badgeVariants = UI.badgeVariants;',
            'var useState = React.useState;',
            'var useMemo = React.useMemo;',
            'var useCallback = React.useCallback;',
            'var useEffect = React.useEffect;',
            'var useRef = React.useRef;',
            'var Fragment = React.Fragment;',
            transformed,
            "if (typeof App === 'undefined') throw new Error('未找到根组件 App');",
            'var root = ReactDOM.createRoot(document.getElementById("root"));',
            'root.render(React.createElement(App));',
          ].join('\\n'),
        );
        runner(React, ReactDOM, UI);
      } catch (err) {
        var el = document.getElementById('root');
        el.innerHTML = '<pre style="padding:16px;font-size:12px;white-space:pre-wrap;color:#b91c1c">' +
          String(err && err.message ? err.message : err) + '</pre>';
      }
    })();
  </script>
</body>
</html>`;
}
