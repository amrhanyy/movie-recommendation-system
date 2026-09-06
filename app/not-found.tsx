import React from "react";
import Link from "next/link";
import { Compass, Home, TrendingUp } from "lucide-react";

/**
 * Branded 404 — rendered inside the root layout's <main> landmark, so this
 * page provides the semantic heading + region structure rather than a nested
 * <main> (which would be invalid HTML).
 *
 * Design: Dark Mode (OLED) cinematic, hero-centric, single primary CTA with a
 * secondary escape hatch. Respects prefers-reduced-motion (no pulsing glow).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-16">
      <section
        aria-labelledby="not-found-heading"
        className="w-full max-w-xl text-center"
      >
        {/* Illustrative icon in a glassmorphic tile */}
        <div className="relative mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-gray-700/50 bg-gray-800/40 backdrop-blur-md">
          <div className="absolute inset-0 rounded-2xl bg-cyan-500/10 blur-md motion-safe:animate-pulse" />
          <Compass className="relative h-10 w-10 text-cyan-400" aria-hidden="true" />
        </div>

        {/* Oversized 404 numeral */}
        <p className="bg-gradient-to-r from-cyan-400 via-cyan-300 to-gray-300 bg-clip-text text-7xl font-extrabold tracking-tight text-transparent sm:text-8xl">
          404
        </p>

        <h1
          id="not-found-heading"
          className="mt-4 text-2xl font-bold text-white sm:text-3xl"
        >
          Page Not Found
        </h1>

        <p className="mx-auto mt-3 max-w-md text-gray-400">
          The reel you&apos;re looking for has been cut, moved, or never made
          it to the screen. Let&apos;s get you back to the good stuff.
        </p>

        {/* CTAs: one primary, one secondary */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-white shadow-lg shadow-cyan-500/25 transition-colors duration-200 hover:bg-cyan-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            Back to Home
          </Link>
          <Link
            href="/trending"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700/60 bg-gray-800/50 px-6 py-3 font-medium text-gray-200 backdrop-blur-md transition-colors duration-200 hover:border-cyan-500/40 hover:bg-gray-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            <TrendingUp className="h-5 w-5 text-cyan-400" aria-hidden="true" />
            Browse Trending
          </Link>
        </div>
      </section>
    </div>
  );
}
