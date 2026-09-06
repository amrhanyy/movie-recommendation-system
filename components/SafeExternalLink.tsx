import React, { type ReactNode } from 'react';
import { safeExternalHref } from '@/lib/ai-security';

interface SafeExternalLinkProps {
  href: unknown;
  children: ReactNode;
  className?: string;
}

/**
 * Renders an external new-tab link only when href is an absolute HTTPS URL.
 * Malformed, javascript:, data:, and protocol-relative values render nothing.
 */
export function SafeExternalLink({ href, children, className }: SafeExternalLinkProps) {
  const safe = safeExternalHref(href);
  if (!safe) return null;

  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
