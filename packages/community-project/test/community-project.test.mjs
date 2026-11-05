import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createCommunityProjectStore, projectStage } from '../src/index.mjs';

function setup(target = 20) {
  let clock = Date.parse('2026-11-04T12:00:00Z');
  const accounts = createAccountStore({ now: () => clock });
  const project = createCommunityProjectStore({ db: accounts.database, now: () => clock, target });
  const user = (name) => accounts.register({ username: name, password: 'matkhau123', displayName: name }).account.id;
  return { project, user, nextDay: () => { clock += 86_400_000; } };
}

test('giai đoạn Bồ Đề tính từ tiến độ chung', () => {
  assert.equal(projectStage(0, 100), 'ground');
  assert.equal(projectStage(1, 100), 'sprout');
  assert.equal(projectStage(50, 100), 'young');
  assert.equal(projectStage(75, 100), 'mature');
  assert.equal(projectStage(100, 100), 'complete');
});

test('mọi tài khoản góp vào một công trình; mỗi việc một lần mỗi ngày', () => {
  const { project, user, nextDay } = setup();
  const an = user('an_lac');
  const binh = user('binh_an');
  assert.equal(project.snapshot().project.progress, 0);
  assert.equal(project.contribute(an, 'water', 'water-key-001').points, 5);
  assert.equal(project.contribute(binh, 'dig', 'dig-key-0001').project.progress, 8);
  assert.equal(project.contribute(an, 'water', 'water-key-002').code, 'ACTION_DONE_TODAY');
  const view = project.snapshot(an);
  assert.equal(view.project.contributors, 2);
  assert.equal(view.project.contributions, 2);
  assert.deepEqual(view.me.today, ['water']);
  assert.equal(view.me.badge, 'bodhi-caretaker');
  nextDay();
  assert.equal(project.contribute(an, 'water', 'water-key-003').ok, true);
});

test('idempotency không cộng hai lần và công trình dừng đúng mục tiêu', () => {
  const { project, user, nextDay } = setup(8);
  const an = user('an_lac');
  const first = project.contribute(an, 'water', 'same-key-001');
  const replay = project.contribute(an, 'water', 'same-key-001');
  assert.equal(replay.replayed, true);
  assert.equal(replay.project.progress, first.project.progress);
  assert.equal(project.contribute(an, 'dig', 'same-key-001').code, 'IDEMPOTENCY_KEY_REUSED');
  nextDay();
  const done = project.contribute(an, 'water', 'finish-key-1');
  assert.equal(done.project.progress, 8);
  assert.equal(done.project.stage, 'complete');
  assert.equal(done.project.completed, true);
  assert.equal(project.contribute(an, 'dig', 'after-key-001').code, 'PROJECT_COMPLETE');
});

test('hồ sen có tiến độ, việc hằng ngày và danh hiệu riêng với cây Bồ Đề', () => {
  const { project, user } = setup();
  const an = user('an_lac');
  const lotus = project.contribute(an, 'lotus-global-1', 'tend', 'lotus-tend-001');
  assert.equal(lotus.ok, true);
  assert.equal(lotus.project.id, 'lotus-global-1');
  assert.equal(lotus.project.kind, 'lotus');
  assert.equal(lotus.project.progress, 4);
  assert.equal(lotus.me.badge, 'lotus-builder');
  assert.equal(project.snapshot(an).project.progress, 0, 'Bồ Đề không bị cộng nhầm');
  assert.equal(project.snapshot(an).projects.length, 2);
  assert.deepEqual(project.snapshot(an).meByProject['lotus-global-1'].today, ['tend']);
  assert.equal(project.contribute(an, 'lotus-global-1', 'water', 'lotus-tend-001').code, 'IDEMPOTENCY_KEY_REUSED');
});
