/**
 * Canonical server-only privacy inventory (R6).
 *
 * This is the single source of truth for what personal or behavioral data the
 * application holds, where it lives, who owns it, whether it is exported or
 * deleted with the account, its retention policy, whether it is sent to
 * Gemini/TMDB, whether administrators can see it, and whether the user can
 * disable its collection.
 *
 * It contains no actual user records or secret values. It powers both the
 * export/account-deletion implementation and the public privacy page.
 */

export interface PrivacyDataCategory {
  id: string;
  label: string;
  storage: string;
  ownerKey: 'email' | 'none-not-user-linked';
  includedInExport: boolean;
  removedOnAccountDeletion: boolean;
  retention: string;
  sentToGeminiOrTmdb: 'gemini' | 'tmdb' | 'none';
  adminAccess: 'yes' | 'no' | 'admin-tools' | 'technical-logs-only';
  userCanDisableCollection: boolean;
  notes: string;
}

export const PRIVACY_DATA_CATEGORIES: PrivacyDataCategory[] = [
  {
    id: 'profile',
    label: 'User profile',
    storage: 'MongoDB `users` collection',
    ownerKey: 'email',
    includedInExport: true,
    removedOnAccountDeletion: true,
    retention: 'Until account deletion',
    sentToGeminiOrTmdb: 'none',
    adminAccess: 'admin-tools',
    userCanDisableCollection: false,
    notes:
      'Email from Google OAuth, display name, avatar image, role. Derived from the OAuth session on first sign-in.',
  },
  {
    id: 'preferences',
    label: 'Preferences and settings',
    storage: 'MongoDB `users.preferences`',
    ownerKey: 'email',
    includedInExport: true,
    removedOnAccountDeletion: true,
    retention: 'Until account deletion',
    sentToGeminiOrTmdb: 'none',
    adminAccess: 'admin-tools',
    userCanDisableCollection: false,
    notes:
      'Favorite genres, selected moods, and the R6 history-tracking preference.',
  },
  {
    id: 'favorites',
    label: 'Favorites',
    storage: 'MongoDB `favorites` collection',
    ownerKey: 'email',
    includedInExport: true,
    removedOnAccountDeletion: true,
    retention: 'Until account deletion',
    sentToGeminiOrTmdb: 'tmdb',
    adminAccess: 'no',
    userCanDisableCollection: false,
    notes: 'Titles and poster paths the user marked as favorites.',
  },
  {
    id: 'watchlist',
    label: 'Watchlist',
    storage: 'MongoDB `watchlists` collection',
    ownerKey: 'email',
    includedInExport: true,
    removedOnAccountDeletion: true,
    retention: 'Until account deletion',
    sentToGeminiOrTmdb: 'tmdb',
    adminAccess: 'no',
    userCanDisableCollection: false,
    notes: 'Titles and poster paths the user saved to watch.',
  },
  {
    id: 'viewing-history',
    label: 'Viewing history',
    storage: 'MongoDB `histories` collection',
    ownerKey: 'email',
    includedInExport: true,
    removedOnAccountDeletion: true,
    retention: 'Bounded; HISTORY_RETENTION_DAYS (default 180 days)',
    sentToGeminiOrTmdb: 'tmdb',
    adminAccess: 'no',
    userCanDisableCollection: true,
    notes:
      'Titles the user recently viewed. New records are only written when the history-tracking preference is enabled and the user is authenticated. TTL cleanup requires a documented index.',
  },
  {
    id: 'chat-history',
    label: 'AI chat history',
    storage: 'MongoDB `chathistories` collection',
    ownerKey: 'email',
    includedInExport: true,
    removedOnAccountDeletion: true,
    retention: 'Bounded; CHAT_RETENTION_DAYS (default 365 days)',
    sentToGeminiOrTmdb: 'gemini',
    adminAccess: 'no',
    userCanDisableCollection: false,
    notes:
      'User and assistant messages. Applies a bounded context window and bounded message count per chat; TTL cleanup requires a documented index.',
  },
  {
    id: 'recent-searches',
    label: 'Recent searches',
    storage: 'Browser localStorage (`ls:search:recent` keys)',
    ownerKey: 'none-not-user-linked',
    includedInExport: false,
    removedOnAccountDeletion: false,
    retention: 'Browser-local, user can clear via the search UI',
    sentToGeminiOrTmdb: 'none',
    adminAccess: 'yes',
    userCanDisableCollection: true,
    notes:
      'Client-only recent search entries. They stay in the user’s own browser, so account deletion does not remove them; the user clears them in the search UI. Server operators have no access.',
  },
  {
    id: 'personalized-cache',
    label: 'Personalized cache',
    storage: 'Redis `user:recommendations` scope',
    ownerKey: 'none-not-user-linked',
    includedInExport: false,
    removedOnAccountDeletion: true,
    retention: 'Short TTL; Redis eviction',
    sentToGeminiOrTmdb: 'none',
    adminAccess: 'technical-logs-only',
    userCanDisableCollection: false,
    notes:
      'Transient recommendation content keyed by a normalized, non-identifying resource id. Purged in a best-effort, namespace-determined way; method is documented in the report.',
  },
  {
    id: 'logs',
    label: 'Operational logs',
    storage: 'Deployment logging backend',
    ownerKey: 'none-not-user-linked',
    includedInExport: false,
    removedOnAccountDeletion: false,
    retention: 'Platform log retention; see deployment docs',
    sentToGeminiOrTmdb: 'none',
    adminAccess: 'technical-logs-only',
    userCanDisableCollection: false,
    notes:
      'Technical event metadata. Privacy operations log only anonymous action categories, success/failure and durations — no chat text, titles, email, or exported content.',
  },
  {
    id: 'google-oauth',
    label: 'Google OAuth profile data',
    storage: 'At Google; app stores a copy in `users`',
    ownerKey: 'email',
    includedInExport: false,
    removedOnAccountDeletion: false,
    retention: 'Controlled by the user at Google',
    sentToGeminiOrTmdb: 'none',
    adminAccess: 'no',
    userCanDisableCollection: false,
    notes:
      'Deleting an app account does not delete the user’s Google account or any Google-held data. The app never cancels or modifies the user’s Google account.',
  },
];

export function privacyCategoryById(id: string): PrivacyDataCategory | undefined {
  return PRIVACY_DATA_CATEGORIES.find((c) => c.id === id);
}
