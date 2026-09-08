import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Chat-list projection contract (post-M4): the server projection for
 * `GET /api/chat-history/list` must stay a SUPERSET of the item properties
 * that `components/ChatList.tsx` actually consumes (`chat.<key>` reads).
 *
 * Background: the M4 projection silently dropped `messages` while ChatList's
 * preview (`getPreviewText(chat.messages)`) still read it, so `undefined.filter`
 * threw during the client render pass and took down /ai-assistant. This suite
 * is the tripwire — any future projection edit that drops a consumed field
 * fails loudly here, fast and deterministically (fs-read only, no mocks).
 */

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

// Keys consumed from list items in ChatList.tsx: every `chat.<key>` read site.
function consumedChatKeys(chatListSrc: string): string[] {
  const keys = new Set<string>();
  for (const m of chatListSrc.matchAll(/chat\.(\w+)/g)) {
    keys.add(m[1]);
  }
  return [...keys];
}

// Keys present in the route's `.select({ ... })` block.
function selectKeys(routeSrc: string): string[] {
  const selectMatch = routeSrc.match(/\.select\(\s*\{([\s\S]*?)\}\s*\)/);
  expect(selectMatch, 'route must contain a .select({...}) projection').toBeTruthy();
  const keys = new Set<string>();
  for (const m of selectMatch![1].matchAll(/(\w+)\s*:/g)) {
    keys.add(m[1]);
  }
  return [...keys];
}

describe('chat-history/list projection <-> ChatList consumption contract', () => {
  it('select keys are a superset of the keys ChatList consumes', () => {
    const chatListSrc = read('components/ChatList.tsx');
    const routeSrc = read('app/api/chat-history/list/route.ts');

    const consumed = consumedChatKeys(chatListSrc);
    const selected = selectKeys(routeSrc);

    // Sanity: the extraction found real work (guards against a silent regex drift).
    expect(consumed.length).toBeGreaterThan(0);
    expect(selected.length).toBeGreaterThan(0);

    const missing = consumed.filter((key) => !selected.includes(key));
    expect(
      missing,
      `ChatList consumes chat.${missing.join(', chat.')} but the /api/chat-history/list projection does not select it — that field would be undefined on the client`
    ).toEqual([]);
  });

  it('the projection includes messages (preview + search depend on it)', () => {
    const selected = selectKeys(read('app/api/chat-history/list/route.ts'));
    expect(selected).toContain('messages');
  });
});
