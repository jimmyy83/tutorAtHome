import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bindTeacherRowActions, runAdminMutation, teacherLocationPayload } from './teacherAdminActions.js';

function createHandlers() {
  const calls = [];
  const handlers = Object.fromEntries([
    'assignLocation', 'changeStatus', 'review', 'uploadPhoto', 'toggleFeatured',
  ].map(name => [name, (...args) => calls.push([name, ...args])]));
  handlers.manageRecord = (...args) => calls.push(['manageRecord', ...args]);
  return { calls, handlers };
}

const teacher = { id: 481, fullName: 'Teacher Example', status: 'rejected', blocked: false };

test('teacher dropdown and row actions dispatch only their intended handler with the selected teacher', () => {
  const event = { target: { value: 'approved' } };
  const actionCases = [
    ['assignLocation', actions => actions.assignLocation(event), ['assignLocation', teacher, event]],
    ['changeStatus', actions => actions.changeStatus(event), ['changeStatus', teacher, 'approved']],
    ['review', actions => actions.review(), ['review', teacher]],
    ['uploadPhoto', actions => actions.uploadPhoto(event), ['uploadPhoto', teacher, event]],
    ['block', actions => actions.block(), ['manageRecord', teacher, 'block']],
    ['archive', actions => actions.archive(), ['manageRecord', teacher, 'archive']],
    ['permanentlyDelete', actions => actions.permanentlyDelete(), ['manageRecord', teacher, 'permanent-delete']],
    ['toggleFeatured', actions => actions.toggleFeatured(), ['toggleFeatured', teacher]],
  ];
  for (const [actionName, invoke, expectedCall] of actionCases) {
    const { calls, handlers } = createHandlers();
    const actions = bindTeacherRowActions(teacher, handlers);
    invoke(actions);
    assert.equal(calls.length, 1, `${actionName} invokes exactly one callback`);
    assert.deepEqual(calls[0], expectedCall, `${actionName} invokes only its handler with its own teacher and argument`);
  }
});

test('location assignment maps dropdown values to the backend location fields only', () => {
  const { calls, handlers } = createHandlers();
  const actions = bindTeacherRowActions(teacher, handlers);
  const event = { target: { value: JSON.stringify({ stateId: 'up', districtId: 'prayagraj', localityId: 'naini' }) } };
  actions.assignLocation(event);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['assignLocation', teacher, event]);
  assert.deepEqual(teacherLocationPayload(JSON.parse(event.target.value)), {
    locationStateId: 'up', locationDistrictId: 'prayagraj', locationLocalityId: 'naini',
  });
});

test('Teachers UI wires each control to its dedicated bound action and keeps buttons non-submitting', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../pages/AdminPage.jsx', import.meta.url)), 'utf8');
  for (const action of ['review', 'uploadPhoto', 'block', 'archive', 'permanentlyDelete', 'assignLocation', 'changeStatus', 'toggleFeatured']) {
    assert.ok(source.includes(`actions.${action}`), `${action} is bound to its own teacher row control`);
  }
  assert.match(source, /api\.patch\(`\/admin\/teachers\/\$\{row\.id\}\/featured`,teacherLocationPayload\(selection\)/);
  assert.match(source, /<button type="button" className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-40"[^>]*onClick=\{actions\.toggleFeatured\}/);
  const signInFormIndex = source.indexOf('<form');
  const unauthenticatedReturnIndex = source.indexOf('if(!token)return');
  const teacherSectionIndex = source.indexOf("{tab==='teachers'");
  assert.ok(signInFormIndex >= 0 && signInFormIndex < teacherSectionIndex);
  assert.ok(unauthenticatedReturnIndex >= 0 && unauthenticatedReturnIndex < teacherSectionIndex, 'teacher controls render after the separate sign-in return branch');
});

test('teacher mutation refreshes do not mistake the API response for a load request ID', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../pages/AdminPage.jsx', import.meta.url)), 'utf8');
  const end = source.indexOf('const changeEnquiryStatus');
  const handlers = source.slice(source.indexOf('const setTeacherLocation'), end);
  assert.match(handlers, /teacherLocationPayload\(selection\),\{authToken:token\}\),\(\)=>load\(\{forceGroups:true\}\)\)/);
  assert.match(handlers, /\/status`,\{status\},\{authToken:token\}\),\(\)=>load\(\{forceGroups:true\}\)\)/);
  assert.match(handlers, /\{featured:!row\.featured\},\{authToken:token\}\),\(\)=>load\(\)\)/);
  assert.doesNotMatch(handlers, /\),load\);/, 'teacher mutation callbacks must not receive the API response as a request ID');
});

test('teacher card has no submitting form or parent click handler around its independent controls', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../pages/AdminPage.jsx', import.meta.url)), 'utf8');
  const start = source.indexOf("{tab==='teachers'");
  const end = source.indexOf("{tab==='enquiries'", start);
  const teachersView = source.slice(start, end);
  assert.doesNotMatch(teachersView, /<form\b|<\/form>/);
  assert.doesNotMatch(teachersView, /return <div key=\{row\.id\}[^>]*onClick=/);
  assert.match(teachersView, /onChange=\{actions\.assignLocation\}/);
  assert.match(teachersView, /onChange=\{actions\.changeStatus\}/);
  assert.match(teachersView, /onClick=\{actions\.review\}/);
});

test('AdminPage map icon does not shadow the built-in Map used for the photo cache', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../pages/AdminPage.jsx', import.meta.url)), 'utf8');
  assert.match(source, /Map as MapIcon/);
  assert.match(source, /useRef\(new Map\(\)\)/);
  assert.match(source, /<MapIcon size=\{15\}\/\>/);
  assert.doesNotMatch(source.split('\n')[1], /(?:^|[,{])\s*Map\s*(?:,|})/, 'Lucide Map must remain aliased, leaving global Map available');
});

test('failed mutations do not invoke success callbacks and the action lock allows only one in-flight request', async () => {
  const lock = { current: false };
  let successCount = 0;
  let actionCount = 0;
  const events = [];
  let rejectAction;
  const pending = runAdminMutation(lock, () => new Promise((_, reject) => { rejectAction = reject; actionCount += 1; }), {
    onSuccess: () => { successCount += 1; }, onError: () => events.push('error'), onFinish: () => events.push('finished'),
  });
  assert.equal(await runAdminMutation(lock, async () => { actionCount += 1; }), false);
  rejectAction(new Error('request failed'));
  assert.equal(await pending, false);
  assert.equal(actionCount, 1);
  assert.equal(successCount, 0);
  assert.deepEqual(events, ['error', 'finished']);
  assert.equal(lock.current, false);
});
