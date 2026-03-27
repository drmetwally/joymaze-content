# JoyMaze Daily Business Workflow

This document defines the daily, weekly, and monthly workflows for running the JoyMaze business using Claude skills (agents). The goal: **hit all quotas with minimum content creation effort** by leveraging repurposing and batching.

---

## Daily Minimum Quotas

| Output | Minimum | Target | Method |
|--------|---------|--------|--------|
| Original content pieces | 3 | 4 | Create once |
| Image posts (all platforms) | 10 | 15 | Repurpose 3-4 originals across 3-5 platforms |
| Short-form videos | 1 | 2 | Slideshow from daily images or educational clip |
| App store review responses | All new | All new | Batch once daily |
| Support responses | All new | All new | Batch once daily |

---

## Daily Workflow (in order)

### Morning Block — Plan & Create (30 min)

**Step 1: Plan today's content**
- **Skill:** `content-strategist`
- **Input:** Today's date, current calendar, seasonal hooks
- **Output:** 3-4 original content briefs (topic, visual, caption direction)
- **Quota:** 3 original pieces minimum — this is the seed for everything

**Step 2: Generate images**
- **Skill:** `image-generator`
- **Input:** Content briefs from Step 1
- **Output:** 3-4 branded base images
- **Quota:** 1 image per brief

**Step 3: Repurpose across platforms**
- **Skill:** `content-repurposer`
- **Input:** Each base image + brief
- **Output:** Platform-adapted versions (resize specs + rewritten captions)
- **Quota:** Each original becomes 3-5 platform versions = 10-15 total posts

**Step 4: Write captions**
- **Skill:** `caption-writer`
- **Input:** Repurposed content plan
- **Output:** Platform-native captions with hashtags and CTAs
- **Quota:** 1 caption per platform version

### Midday Block — Video & Post (20 min)

**Step 5: Assemble daily video**
- **Skill:** `video-producer`
- **Input:** Today's images + a topic from content plan
- **Output:** 1-2 short-form videos (slideshow or educational)
- **Quota:** 1 video minimum

**Step 6: Quality check**
- **Skill:** `brand-voice-guardian`
- **Input:** All captions and text overlays from today
- **Output:** Approved or revised copy
- **Quota:** Review all before posting

**Step 7: Post content**
- **Script:** `npm run post` or n8n workflow
- **Input:** Queued content from output/queue/
- **Output:** Published posts across all platforms

### Afternoon Block — Engage & Support (15 min)

**Step 8: Respond to app reviews**
- **Skill:** `app-review-responder`
- **Input:** New app store reviews (iOS + Android)
- **Output:** Drafted responses
- **Quota:** Respond to all new reviews

**Step 9: Handle support messages**
- **Skill:** `brand-customer-support`
- **Input:** New emails, DMs, inquiries
- **Output:** Drafted responses
- **Quota:** Respond to all within 24 hours

---

## Weekly Workflow

### Monday — Plan the Week

| Task | Skill | Output |
|------|-------|--------|
| Plan weekly content calendar | `content-calendar-manager` | 7-day calendar with daily briefs |
| Review last week's performance | `strategy-report-generator` | Weekly content performance report |
| Check content pillar balance | `content-calendar-manager` | Rebalance if any pillar under-represented |

### Wednesday — Outreach & Growth

| Task | Skill | Output |
|------|-------|--------|
| Draft 3-5 influencer pitches | `outreach-influencer` | Personalized outreach messages |
| Write weekly newsletter | `outreach-email-marketer` | Email draft + 3 subject line variations |
| Review ad performance (if running) | `outreach-ad-copywriter` | Refresh underperforming ad variations |

### Friday — KDP & Strategy

| Task | Skill | Output |
|------|-------|--------|
| Review KDP sales data | `strategy-report-generator` | KDP sales snapshot |
| Plan next week's KDP content posts | `content-calendar-manager` | 2+ KDP book posts scheduled |
| Update competitor notes (if new data) | `strategy-competitor-analyst` | Updated competitor file |

---

## Monthly Workflow

### First Week of Month — Review & Plan

| Task | Skill | Output |
|------|-------|--------|
| Monthly business report | `strategy-report-generator` | Full monthly summary (content + KDP + app) |
| Market research scan | `strategy-market-researcher` | Trends brief — what's changed in kids app/book market |
| Competitor analysis refresh | `strategy-competitor-analyst` | Updated competitive landscape |
| Plan monthly content themes | `content-calendar-manager` | Month-level theme calendar |

### Mid-Month — Optimize

| Task | Skill | Output |
|------|-------|--------|
| ASO review | `app-aso-optimizer` | Updated keywords/description if needed |
| KDP listing optimization | `kdp-listing-optimizer` | Refresh listings for seasonal keywords |
| Ad copy refresh | `outreach-ad-copywriter` | New ad variations for next 2 weeks |
| Email sequence review | `outreach-email-marketer` | Update welcome/nurture sequences if needed |

### As Needed — KDP Book Production

| Task | Skill | Output |
|------|-------|--------|
| Plan new book | `kdp-book-planner` | Book blueprint (theme, pages, activity mix) |
| Design book interior | `kdp-interior-designer` | Page-by-page layout plan |
| Write book listing | `kdp-listing-optimizer` | Title, description, keywords |
| Create launch content | `content-strategist` + `outreach-email-marketer` | Social + email launch campaign |

---

## The 1-to-5 Efficiency Rule

The entire system is built on **creating minimum, distributing maximum**:

```
3 original pieces/day
  x 4 platforms each (Pinterest, Instagram, X, TikTok/YouTube)
  = 12 posts/day
  + 1 video (assembled from same images)
  = 13 total daily outputs from 3 creations
```

**Why this works:**
- Each platform gets native-feeling content (not copy-paste)
- Repurposing is faster than creating from scratch
- Brand consistency maintained through `brand-voice-guardian` gate
- Video reuses image assets — no separate video production needed

---

## Skill Dependencies (which skills feed into which)

```
content-calendar-manager
  └── content-strategist (daily briefs)
        ├── image-generator (base images)
        │     └── content-repurposer (platform versions)
        │           └── caption-writer (platform captions)
        │                 └── brand-voice-guardian (quality gate)
        │                       └── POST (npm run post)
        └── video-producer (daily video from same images)

kdp-book-planner
  └── kdp-interior-designer (page layouts)
        └── kdp-listing-optimizer (Amazon listing)

strategy-market-researcher ──┐
strategy-competitor-analyst ─┤── strategy-report-generator
app metrics ─────────────────┘

outreach-influencer ─── brand-voice-guardian (review before sending)
outreach-email-marketer ── brand-voice-guardian
outreach-ad-copywriter ── brand-voice-guardian

app-review-responder ── brand-voice-guardian
brand-customer-support ── brand-voice-guardian
```

---

## Quick Reference — All Skills by Category

| Category | Skill | When to Use |
|----------|-------|-------------|
| **Content** | `content-strategist` | Daily content briefs |
| | `content-calendar-manager` | Weekly/monthly planning |
| | `caption-writer` | Platform captions |
| | `image-generator` | Base image creation |
| | `video-producer` | Short-form video assembly |
| | `content-repurposer` | Adapt 1 piece to all platforms |
| **KDP** | `kdp-book-planner` | Plan new activity books |
| | `kdp-interior-designer` | Design book page layouts |
| | `kdp-listing-optimizer` | Amazon listing SEO |
| **App** | `app-aso-optimizer` | App store listing optimization |
| | `app-review-responder` | Respond to app reviews |
| **Strategy** | `strategy-market-researcher` | Market trends & opportunities |
| | `strategy-competitor-analyst` | Competitor breakdowns |
| | `strategy-report-generator` | Business reports from data |
| **Outreach** | `outreach-email-marketer` | Email campaigns & newsletters |
| | `outreach-influencer` | Influencer collaboration pitches |
| | `outreach-ad-copywriter` | Paid ad copy (Meta, Google, Pinterest) |
| **Brand** | `brand-voice-guardian` | Copy review & quality gate |
| | `brand-customer-support` | Support responses (email, DMs) |
