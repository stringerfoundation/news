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
  assert.equal(commonsSubject('At odds over the EU budget, European leaders cut summit short - DW has more'), 'EU');
  assert.equal(commonsSubject('On farewell trip, Steinmeier calls for more investment in Africa'), 'Steinmeier');
  assert.equal(commonsSubject('In Praise of My Typewriter'), 'Typewriter');
  assert.equal(commonsSubject('Why are winter rains forcing Palestinians in Gaza to flee again?'), 'Gaza');
  assert.equal(commonsSubject('Judges in Israel Suggest Dropping Key Corruption Case Against Netanyahu'), 'Israel');
  assert.equal(commonsSubject('French actor Gerard Depardieu to face trial for rape, court rules'), 'Gerard Depardieu');
  assert.equal(commonsSubject('New trial hearings begin tomorrow'), 'New trial hearings begin tomorrow');
  assert.equal(commonsSubject("British police link substance release at Don Toliver's recent Manchester concert to robbery attempts"), 'Don Toliver');
  assert.equal(commonsSubject('Russia’s Big Ambitions for A.I. Are Undercut by Constraints of War'), 'Russia');
  assert.equal(commonsSubject('Quebec Can Keep Its Ban on Religious Symbols, Canada’s Top Court Rules'), 'Quebec');
  assert.equal(commonsSubject('no named subject'), 'no named subject');
});
