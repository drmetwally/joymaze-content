#!/usr/bin/env node

/**
 * JoyMaze Content — API Setup Checker
 *
 * Validates all API keys and permissions are configured correctly.
 *
 * Usage: node scripts/setup-check.mjs
 */

import 'dotenv/config';

const CHECKS = [
  {
    name: 'Anthropic (Claude)',
    envKeys: ['ANTHROPIC_API_KEY'],
    test: async () => {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say OK' }],
      });
      return msg.content[0].text.includes('OK');
    },
  },
  {
    name: 'OpenAI (DALL-E)',
    envKeys: ['OPENAI_API_KEY'],
    test: async () => {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const models = await openai.models.list();
      return models.data.length > 0;
    },
  },
  {
    name: 'Google AI (Gemini)',
    envKeys: ['GOOGLE_AI_API_KEY'],
    test: async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent('Say OK');
      return result.response.text().includes('OK');
    },
  },
  {
    name: 'Pinterest',
    envKeys: ['PINTEREST_ACCESS_TOKEN'],
    test: null, // Manual verification needed
  },
  {
    name: 'Instagram (Meta Graph API)',
    envKeys: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID'],
    test: null,
  },
  {
    name: 'X (Twitter)',
    envKeys: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'],
    test: null,
  },
  {
    name: 'TikTok',
    envKeys: ['TIKTOK_ACCESS_TOKEN'],
    test: null,
  },
  {
    name: 'YouTube',
    envKeys: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'],
    test: null,
  },
];

async function main() {
  console.log('=== JoyMaze API Setup Check ===\n');

  let allGood = true;

  for (const check of CHECKS) {
    const missingKeys = check.envKeys.filter(
      k => !process.env[k] || process.env[k].includes('your-')
    );

    if (missingKeys.length > 0) {
      console.log(`[ ] ${check.name} — MISSING: ${missingKeys.join(', ')}`);
      allGood = false;
      continue;
    }

    if (check.test) {
      try {
        const ok = await check.test();
        console.log(`[${ok ? 'x' : ' '}] ${check.name} — ${ok ? 'CONNECTED' : 'FAILED'}`);
        if (!ok) allGood = false;
      } catch (err) {
        console.log(`[ ] ${check.name} — ERROR: ${err.message}`);
        allGood = false;
      }
    } else {
      console.log(`[?] ${check.name} — Keys present (manual verification needed)`);
    }
  }

  console.log('');
  if (allGood) {
    console.log('All checks passed! You are ready to generate and post content.');
  } else {
    console.log('Some checks failed. See docs/PLATFORM_SETUP_GUIDE.md for setup instructions.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
