'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { safeExternalHref } from './ai-security';

/**
 * Safe Markdown renderer for untrusted model output (R5).
 *
 * Uses react-markdown with raw HTML disabled.
 * Renders Markdown as React elements. Never builds an HTML string.
 * Raw HTML plugins are not used.
 *
 * Allowlist: p, h1-h3, ul/ol/li, em, strong, code, pre, blockquote, a.
 * Images, iframes, scripts, styles, SVG, forms, and event handlers are omitted.
 * Links: absolute HTTPS only; target=_blank with rel="noopener noreferrer nofollow".
 */

const ALLOWED_ELEMENTS = [
  'p',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'em',
  'strong',
  'code',
  'pre',
  'blockquote',
  'a',
] as const;

function markdownUrlTransform(url: string): string {
  return safeExternalHref(url) ?? '';
}

export function SafeMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-1">
      <ReactMarkdown
        allowedElements={[...ALLOWED_ELEMENTS]}
        unwrapDisallowed={false}
        urlTransform={markdownUrlTransform}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-cyan-300 mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-cyan-300 mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-md font-bold text-cyan-300 mt-2 mb-1">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside my-3 space-y-1 pl-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside my-3 space-y-1 pl-2">{children}</ol>
          ),
          li: ({ children }) => <li className="mb-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-cyan-500/30 pl-4 italic text-gray-300">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-gray-800/70 px-1.5 py-0.5 rounded text-cyan-200 text-sm">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-gray-800/70 rounded-md p-3 my-2 overflow-x-auto text-sm border border-gray-700/50">
              {children}
            </pre>
          ),
          a: ({ href, children }) => {
            const safe = safeExternalHref(href);
            if (!safe) {
              return <span>{children}</span>;
            }
            return (
              <a
                href={safe}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                {children}
              </a>
            );
          },
          img: () => null,
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}

export default SafeMarkdown;
