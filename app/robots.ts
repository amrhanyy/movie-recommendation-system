import type { MetadataRoute } from 'next'

// Phase 25 (Q): crawl policy.
//
// Reflectionbot is the confirmed actor behind the 2026-11 request amplification
// (see the incident report). The Vercel Firewall rule is the primary control;
// this file is the cooperative layer, so a compliant deployment of that agent
// stops requesting dynamic pages at all.
//
// No sitemap is advertised because app/sitemap.ts does not exist: advertising a
// URL that 404s would hand crawlers another failing endpoint to retry.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'Reflectionbot',
        disallow: '/',
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/profile/',
          '/favorites/',
          '/watchlist/',
          '/ai-assistant/',
          '/auth/',
          '/search',
          '/movie/',
          '/tv/',
        ],
      },
    ],
  }
}
