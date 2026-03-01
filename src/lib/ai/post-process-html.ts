import { log } from '@/lib/logger';

export function postProcessHTML(raw: string): string {
    let html = raw.trim();

    html = html.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    if (!html.toLowerCase().startsWith('<!doctype')) {
        html = '<!DOCTYPE html>\n' + html;
    }

    if (!html.includes('cdn.tailwindcss.com')) {
        html = html.replace(
            '</head>',
            '  <script src="https://cdn.tailwindcss.com"></script>\n</head>'
        );
    }

    if (!html.includes('viewport')) {
        html = html.replace(
            '</head>',
            '  <meta name="viewport" content="width=device-width, initial-scale=1">\n</head>'
        );
    }

    if (!html.includes('fonts.googleapis.com') && !html.includes('Inter')) {
        html = html.replace(
            '</head>',
            '  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">\n</head>'
        );
    }

    const allowedScriptPatterns = [
        'cdn.tailwindcss.com',
        'alpinejs',
        'tailwind.config',
        'fonts.googleapis.com',
    ];

    html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match) => {
        if (allowedScriptPatterns.some((pattern) => match.includes(pattern))) {
            return match;
        }
        log.info('Post-process HTML: stripped script tag');
        return '';
    });

    html = html.replace(/\s(on\w+)="[^"]*"/gi, (match, handler) => {
        if (handler.toLowerCase().startsWith('on') && !match.includes('@')) {
            log.info('Post-process HTML: stripped inline handler', { handler });
            return '';
        }
        return match;
    });

    html = html.replace(/action="https?:\/\/[^"]*"/gi, 'action="#"');

    if (!html.includes('scroll-smooth')) {
        html = html.replace('<html', '<html class="scroll-smooth"');
    }

    return html;
}
