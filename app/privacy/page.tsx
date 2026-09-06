import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description: "How Movie Recommendation System handles your data.",
};

/**
 * Public privacy page (R6).
 *
 * Accurate statements only: each claim reflects what the code actually does.
 * No compliance certification, no fake company/address, no tracking scripts.
 * Contact/support details are an operator placeholder that must be replaced
 * before production, and the policy must be reviewed by qualified counsel.
 */
export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-400 mb-8">Effective date: 2026-08-20. Last updated: 2026-08-20.</p>

      <section className="space-y-6 text-gray-300 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">1. What we store</h2>
          <p>
            When you sign in with Google OAuth we store your email address, display
            name, avatar image, and an account role in our database. We also store
            your favorite genres, moods, favorites, watchlist, viewing history, and
            AI chat history, each tied to your account.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">2. Viewing-history tracking</h2>
          <p>
            We only record which titles you view when you are signed in and when
            history tracking is enabled in your preferences. You can turn history
            tracking on or off and clear your viewing history from the settings on
            your profile. Turning tracking off stops new records but does not delete
            records already collected; use the clear action for that.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">3. AI chat history and Gemini</h2>
          <p>
            Your chat messages and previous turns in a conversation are stored for
            you and sent to Google Gemini to produce an answer. Our model requests
            are structured so that system instructions are kept separate from your
            message, and conversations are bounded in size. Prompt injection is not
            fully solvable, so model output is treated as untrusted and rendered as
            safe Markdown without raw HTML.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">4. TMDB</h2>
          <p>
            To resolve movie and TV titles we send those titles to The Movie Database
            (TMDB). Favorites, watchlist, and history titles are used to look up
            metadata and to recommend content.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">5. Recent searches</h2>
          <p>
            Recent searches are stored only in your browser local storage
            (site-scoped localStorage). They are not sent to our servers. You can
            clear them from the search interface.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">6. Cache and performance</h2>
          <p>
            We use a fast cache (an in-memory fallback and optionally a
            namespace-scoped Redis) to reduce database and upstream load. What we
            cache is technical response data, not your chat text or titles, and cache
            keys do not contain your email or identity. Personalized recommendation
            cache entries are best-effort removed when an account is deleted.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">7. Retention</h2>
          <p>
            Viewing history is kept for a bounded period (default 180 days) and chat
            history for a bounded period (default 365 days). Retention values can be
            adjusted only within safe bounds by the operator through configuration.
            Operational logs may contain technical event metadata
            (action category, success/failure, duration) but not full chat content
            or secrets.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">8. Your controls</h2>
          <p>
            Signed-in users can: export a copy of their data ({"GET /api/user/export"}),
            delete their account ({"DELETE /api/user/account"} with an explicit
            confirmation), clear viewing history, delete a single conversation, and
            delete all conversations.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">9. Google account data</h2>
          <p>
            Deleting your Movie Recommendation System account does <strong>not</strong>{" "}
            delete your Google account or any data held by Google. This application
            never modifies or revokes your Google account or its access. Review your
            Google account settings at Google for any Google-held data.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">10. Backups and deletion</h2>
          <p>
            Deleted account data may remain in backups until those backups naturally
            expire or are rotated. Deletion removes active application records; it
            cannot retroactively erase copies already written to backups.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">11. Contact and review</h2>
          <p>
            For privacy questions or data requests, contact the operator at{" "}
            <span className="text-gray-500">[operator contact placeholder - replace before launch]</span>.
            This policy must be reviewed by qualified counsel before production and
            does not itself constitute a claim of any specific legal compliance.
          </p>
        </div>
      </section>

      <div className="mt-10">
        <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm">
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}
