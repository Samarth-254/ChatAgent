import test from 'node:test';
import assert from 'node:assert/strict';
import { routeQuery } from '../src/domain/queryRouter.js';

test('Router: routes greeting to fast model with no search', () => {
  const res = routeQuery({ userMessage: 'Hey there! How are you?' });
  assert.equal(res.forceSearch, false);
  assert.equal(res.isDeep, false);
});

test('Router: routes math to fast model with no search', () => {
  const res = routeQuery({ userMessage: 'What is 15% of 340?' });
  assert.equal(res.forceSearch, false);
  assert.equal(res.isDeep, false);
});

test('Router: forces search and deep model for competitive pricing and baseline', () => {
  const res = routeQuery({
    userMessage: 'Has any CRM pricing changed since Monday?',
    hasBaseline: true
  });
  assert.equal(res.forceSearch, true);
  assert.equal(res.isDeep, true);
});

