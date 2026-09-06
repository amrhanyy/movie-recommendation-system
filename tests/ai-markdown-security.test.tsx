import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SafeMarkdown } from '@/lib/ai-markdown.tsx';
import { SafeYouTubeEmbed } from '@/components/SafeYouTubeEmbed.tsx';
import { SafeExternalLink } from '@/components/SafeExternalLink.tsx';

describe('R5-A: AI Markdown rendering', () => {
  it('script tag never executes or renders as HTML', () => {
    const { container } = render(
      <SafeMarkdown content={'<script>alert(1)</script>'} />
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/<script[\s>]/);
  });

  it('img onerror is not rendered as active HTML', () => {
    const { container } = render(
      <SafeMarkdown content={'<img src=x onerror=alert(1)>'} />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/<img[\s>]/);
  });

  it('svg onload is not active', () => {
    const { container } = render(
      <SafeMarkdown content={'<svg onload=alert(1)></svg>'} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('javascript: link is inert (text only)', () => {
    const { container } = render(
      <SafeMarkdown content={'[click](javascript:alert(1))'} />
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('data: link is rejected', () => {
    const { container } = render(
      <SafeMarkdown content={'[click](data:text/html,x)'} />
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('protocol-relative link is rejected', () => {
    const { container } = render(
      <SafeMarkdown content={'[click](//evil.com/x)'} />
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('malformed URL does not crash and produces no anchor', () => {
    const { container } = render(
      <SafeMarkdown content={'[click](https://exa mple.com/x)'} />
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('safe HTTPS Markdown link renders with correct rel attributes', () => {
    const { container } = render(
      <SafeMarkdown content={'[movies](https://example.com/movies)'} />
    );
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a?.getAttribute('href')).toBe('https://example.com/movies');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(a?.getAttribute('target')).toBe('_blank');
  });

  it('markdown basics still render (headings, bold, lists, code)', () => {
    const { container } = render(
      <SafeMarkdown content={'## Title\n\n**bold** and *italic*\n\n- one\n- two\n\n`code`'} />
    );
    expect(container.querySelector('h2')?.textContent).toContain('Title');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelector('code')?.textContent).toBe('code');
  });

  it('markdown image syntax is not rendered', () => {
    const { container } = render(
      <SafeMarkdown content={'![x](https://evil.example/x.png)'} />
    );
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('R5-H: YouTube embed component', () => {
  it('valid YouTube ID creates expected origin', () => {
    const { container } = render(
      <SafeYouTubeEmbed videoId="dQw4w9WgXcQ" title="Trailer" />
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    );
    expect(iframe?.getAttribute('title')).toBe('Trailer');
    expect(iframe?.getAttribute('loading')).toBe('lazy');
    expect(iframe?.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
  });

  it('invalid or malicious ID creates no iframe', () => {
    const { container } = render(
      <SafeYouTubeEmbed videoId="javascript:alert(1)" title="Trailer" />
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('full arbitrary URLs are rejected', () => {
    const { container } = render(
      <SafeYouTubeEmbed videoId="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Trailer" />
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('quote/attribute injection is rejected', () => {
    const { container } = render(
      <SafeYouTubeEmbed videoId={'" onload="alert(1)'} title="Trailer" />
    );
    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('R5-B: SafeExternalLink', () => {
  it('renders https links with noopener noreferrer', () => {
    const { container } = render(
      <SafeExternalLink href="https://example.com">Site</SafeExternalLink>
    );
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a?.getAttribute('target')).toBe('_blank');
  });

  it('does not render javascript or protocol-relative hrefs', () => {
    const { container } = render(
      <>
        <SafeExternalLink href="javascript:alert(1)">x</SafeExternalLink>
        <SafeExternalLink href="//evil.com">y</SafeExternalLink>
      </>
    );
    expect(container.querySelectorAll('a').length).toBe(0);
  });
});
