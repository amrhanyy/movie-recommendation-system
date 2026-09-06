/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Enable Next.js image optimization (remote posters/avatars). `unoptimized`
    // was previously true, which disabled resizing/format negotiation and hurt
    // LCP. Remote hosts are pinned below; anything not listed is rejected.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
    // Optimal modern compression for poster/avatar bytes.
    formats: ['image/avif', 'image/webp'],
  },
  // Security headers (F-048 fix) + Content-Security-Policy (R5)
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production'
    // Dev: Next.js dev runtime needs inline hydration scripts + eval (webpack).
    // Prod stays locked: no unsafe-eval, no inline scripts.
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self'"
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      scriptSrc,
      // Inline styles are required by the Tailwind/React runtime for dynamic
      // class/style injection (e.g. shadcn chart CSS vars, styled-jsx).
      // Documented limitation: style-src 'unsafe-inline' is the only inline
      // exception; scripts never allow it.
      "style-src 'self' 'unsafe-inline'",
      // TMDB posters plus Google OAuth avatar host used by AuthButton.
      // CSS background data: URIs in globals.css require img-src data:.
      "img-src 'self' data: https://image.tmdb.org https://lh3.googleusercontent.com",
      "font-src 'self'",
      // Same-origin API calls only; Gemini/TMDB stay server-side
      "connect-src 'self'",
      // YouTube embeds: constructed youtube-nocookie URLs only
      "frame-src https://www.youtube-nocookie.com",
      "media-src 'none'",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'off',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
}

export default nextConfig
