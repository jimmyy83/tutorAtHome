import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTeacherTermsDraft } from './teacherTermsDraft.js';

test('accepts non-empty terms and optional summary within server limits', () => {
  assert.deepEqual(validateTeacherTermsDraft(' First rule \n\nSecond rule ', ''), { content: [' First rule ', 'Second rule '], fields: {}, valid: true });
});
test('accepts long existing terms and keeps numbered subclauses as separate unchanged entries', () => {
  const rules = Array.from({ length: 72 }, (_, index) => `Clause ${index + 1}`);
  rules.splice(18, 0, '19.2 Subclause text', '19.3 Another subclause');
  const result = validateTeacherTermsDraft(rules.join('\n'), 'Existing terms');
  assert.equal(result.valid, true);
  assert.deepEqual(result.content, rules);
  assert.ok(result.content.includes('19.2 Subclause text'));
  assert.ok(result.content.includes('19.3 Another subclause'));
});
test('reports the exact terms field for empty, over-limit, and oversized content', () => {
  assert.equal(validateTeacherTermsDraft('  \n ', '').fields.content, 'Enter at least one non-empty terms condition.');
  assert.equal(validateTeacherTermsDraft(Array(500).fill('rule').join('\n'), '').valid, true);
  assert.match(validateTeacherTermsDraft(Array(501).fill('rule').join('\n'), '').fields.content, /500/);
  assert.match(validateTeacherTermsDraft('x'.repeat(3001), '').fields.content, /3,000/);
});
test('reports an overlong optional change summary by field', () => {
  assert.match(validateTeacherTermsDraft('valid rule', 'x'.repeat(301)).fields.changeSummary, /300/);
});
