import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('a long diagram description and an invalid neighbor do not hide published articles', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const vite = await createServer({ configFile: false, root, appType: 'custom',
    resolve: { alias: { '@': root, 'server-only': root + 'node_modules/server-only/empty.js' } },
    server: { middlewareMode: true, hmr: false },
  });
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'fixture';
    const { articles } = await vite.ssrLoadModule('/app/content-public.ts');
    const valid = { ...articles[0], slug: 'published-new-article', imageAlt: 'Descrição acessível do diagrama. '.repeat(25) };
    globalThis.fetch = async () => Response.json([{ ...valid, slug: 'invalid', sourceUrl: 'javascript:invalid' }, valid]);
    const { getPublicArticles, getPublicArticle } = await vite.ssrLoadModule('/lib/content/public.ts');
    assert.deepEqual((await getPublicArticles()).map(a => a.slug), ['published-new-article']);
    assert.equal((await getPublicArticle(valid.slug)).imageAlt, valid.imageAlt);
    assert.equal(await getPublicArticle('invalid'), null);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
    await vite.close();
  }
});
