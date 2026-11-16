
'use strict';

// ─── GIVEN FILE — modify only to add caching (do not remove existing code) ───

require('dotenv').config();

const express = require('express');
const db = require('./db');
const { cacheGet, cacheSet, cacheDel } = require('./cache');

const app = express();
app.use(express.json());

const FEED_KEY = 'feed:trending';
const FEED_TTL = 60;   // seconds

app.get('/health', (req, res) => res.json({ ok: true }));

// GET /feed — cache-aside with 60-second TTL
app.get('/feed', async (req, res) => {
  try {
    // 1. Check Redis cache
    const cachedPosts = await cacheGet(FEED_KEY);

    // 2. If cache HIT, return cached data
    if (cachedPosts !== null && cachedPosts !== undefined) {
      res.set('X-Cache', 'HIT');
      console.log('[feed] HIT');
      return res.json(cachedPosts);
    }

    // 3. Cache MISS — fetch data from database
    const t0 = Date.now();
    const posts = await db.getTrendingPosts();

    console.log(`[feed] MISS — DB ${Date.now() - t0}ms`);

    // 4. Store the result in Redis for 60 seconds
    await cacheSet(FEED_KEY, posts, FEED_TTL);

    res.set('X-Cache', 'MISS');
    return res.json(posts);

  } catch (err) {
    console.error('[feed] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /posts — create a post and invalidate the cached feed
app.post('/posts', async (req, res) => {
  try {
    const post = await db.createPost(req.body);

    // Invalidate stale cached feed
    await cacheDel(FEED_KEY);

    res.status(201).json(post);
  } catch (err) {
    console.error('[posts] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
}

module.exports = { app };
