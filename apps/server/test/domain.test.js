import test from 'node:test';
import assert from 'node:assert/strict';

import { extractTopicKeywords, scorePairRelevance, selectBestBaseline } from '../src/domain/recallPlanner.js';
import { canonicalizeUrl, categorizeDomain } from '../src/domain/urlCanonicalizer.js';
import { processRawResults, formatResultsForModel, classifyBaselineChange } from '../src/domain/resultRanker.js';

test('Domain: extractTopicKeywords strips dates and meta phrases', () => {
  const q = 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?';
  const topic = extractTopicKeywords(q);
  assert.equal(topic, 'Postgres hosting');
});

test('Domain: scorePairRelevance scores keyword matches higher', () => {
  const pair1 = { userMsg: { content: 'CRM tools' }, assistantMsg: { content: 'HubSpot' } };
  const pair2 = { userMsg: { content: 'Postgres hosting' }, assistantMsg: { content: 'Neon serverless Postgres' } };
  assert.ok(scorePairRelevance(pair2, 'Postgres hosting') > scorePairRelevance(pair1, 'Postgres hosting'));
});

test('Domain: recallPlanner selects best baseline pair based on topic match', () => {
  const pairs = [
    {
      userMsg: { content: 'What is the capital of France?' },
      assistantMsg: { content: 'Paris' },
      localDate: '2026-11-10'
    },
    {
      userMsg: { content: 'What are the best serverless Postgres hosting providers in 2026?' },
      assistantMsg: { content: 'Supabase and Neon are the leading serverless Postgres platforms.' },
      localDate: '2026-11-03'
    }
  ];

  const best = selectBestBaseline(pairs, 'Postgres hosting', '2026-11-03');
  assert.ok(best);
  assert.equal(best.localDate, '2026-11-03');
  assert.match(best.assistantMsg.content, /Supabase and Neon/);
});

test('Domain: canonicalizeUrl removes tracking parameters and normalizes', () => {
  const dirty = 'https://www.HubSpot.com/pricing/crm/?utm_source=google&utm_campaign=spring#overview';
  const clean = canonicalizeUrl(dirty);
  assert.equal(clean, 'https://hubspot.com/pricing/crm');
});

test('Domain: categorizeDomain boosts official, changelog, and pricing pages', () => {
  const official = categorizeDomain('https://supabase.com/pricing', 'supabase');
  assert.equal(official.type, 'official');
  assert.ok(official.boost >= 2.0);

  const aggregator = categorizeDomain('https://top10.com/best-crm-software', 'crm');
  assert.equal(aggregator.type, 'aggregator');
  assert.ok(aggregator.boost < 1.0);

  const news = categorizeDomain('https://techcrunch.com/article', 'startup funding');
  assert.equal(news.type, 'news');
  assert.equal(news.boost, 1.5);
});

test('Domain: resultRanker sorts official-domain above listicles/aggregators', () => {
  const raw = [
    {
      url: 'https://top10.com/best-crm-tools',
      title: 'Top 10 CRM Tools 2026',
      content: 'HubSpot and Salesforce comparison listicle',
      score: 0.99
    },
    {
      url: 'https://hubspot.com/pricing/crm',
      title: 'Official HubSpot CRM Pricing & Plans',
      content: 'Official HubSpot Sales Hub pricing starting at $15/seat',
      score: 0.70
    },
    {
      url: 'https://selecthub.com/crm-software-pricing',
      title: 'SelectHub Pricing Guide',
      content: 'Aggregator pricing estimates',
      score: 0.95
    }
  ];

  const processed = processRawResults(raw, 'hubspot');
  assert.equal(processed[0].domain, 'hubspot.com', 'Official domain must be ranked #1');
  assert.equal(processed[0].type, 'official');
  assert.ok(processed[1].type === 'aggregator' || processed[2].type === 'aggregator');
});

test('Domain: resultRanker trims content to ~600 chars and limits results', () => {
  const longContent = 'A'.repeat(1500);
  const raw = [
    { url: 'https://test1.com', title: 'Test 1', content: longContent, published_date: '2026-11-01' },
    { url: 'https://test2.com', title: 'Test 2', content: 'Short content', published_date: '2026-11-02' }
  ];
  const processed = processRawResults(raw, 'test');
  assert.equal(processed.length, 2);

  const formatted = formatResultsForModel(processed, null, 4);
  assert.ok(formatted.includes('Test 1'));
  assert.ok(!formatted.includes('A'.repeat(800)), 'Content must be trimmed to ~600 chars');
});

test('Domain: classifyBaselineChange enforces evidence rule for changes', () => {
  // 1. Post-baseline dated source with differing value -> changed
  const postSource = { type: 'official', published_date: '2026-11-05', postBaseline: true };
  const status1 = classifyBaselineChange({
    baselineValue: '$19/month',
    liveValue: '$0.106/CU-hour',
    sources: [postSource]
  });
  assert.equal(status1, 'changed');

  // 2. Pre-baseline official source with differing value -> differs, change date unknown
  const preSource = { type: 'official', published_date: '2026-11-01', postBaseline: false };
  const status2 = classifyBaselineChange({
    baselineValue: '$19/month',
    liveValue: '$25/month',
    sources: [preSource]
  });
  assert.equal(status2, 'differs, change date unknown');

  // 3. No differing evidence / matching value -> no change found
  const matchingSource = { type: 'official', published_date: '2026-11-05', postBaseline: true };
  const status3 = classifyBaselineChange({
    baselineValue: '$25/month',
    liveValue: '$25/month',
    sources: [matchingSource]
  });
  assert.equal(status3, 'no change found');
});
