import test from 'node:test';
import assert from 'node:assert/strict';
import { commonsSubject } from '../../relay/commons.js';

test('Commons suggestions search the named subject instead of the entire headline', () => {
  assert.equal(commonsSubject('The Failures of Emmanuel Macron'), 'Emmanuel Macron');
  assert.equal(commonsSubject('Trump signs order launching women’s health division at NIH, White House says'), 'Trump');
  assert.equal(commonsSubject('Flooding in New Delhi closes schools'), 'New Delhi');
  assert.equal(commonsSubject('talks with Ursula von der Leyen resume'), 'Ursula von der Leyen');
  assert.equal(commonsSubject('talks with Emmanuel Macron resume'), 'Emmanuel Macron');
  assert.equal(commonsSubject('Saudi flagship investment conference pushed to 2027 after Houthi attacks'), 'Saudi Arabia');
  assert.equal(commonsSubject('Kenya convicts cult leader over the murder of 190 children'), 'Kenya');
  assert.equal(commonsSubject('Deaths at Danjiri Float Festival Prompt Questions in Japan'), 'Danjiri Float Festival');
  assert.equal(commonsSubject('Ex-OpenAI worker accused of planting device had Saudi support, says court filing'), 'OpenAI');
  assert.equal(commonsSubject('no named subject'), 'no named subject');
});
