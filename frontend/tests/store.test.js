import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, SAMPLE, STORAGE_KEY } from '../src/store.js';
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
test('连续抛瓶各自保留，刷新后经历与瓶子独立', () => {
  const storage = memory(),
    store = createStore(storage);
  const e = store.experience({
    title: '找实习',
    body: '投了很多份后得到第一份实习',
    confirmed: true,
    open: true,
  });
  store.send('最近很犹豫', '走过这段路的人');
  store.send('新的问题', '有不同经历的人');
  const restored = createStore(storage).get();
  assert.equal(restored.bottles.length, 2);
  assert.notEqual(restored.bottles[0].id, restored.bottles[1].id);
  assert.equal(restored.experiences[0].id, e.id);
  assert.deepEqual(restored.draft, { body: '', target: '' });
});
test('拒收不会变成已接收，也不能写回信，重复操作不会重复记录', () => {
  const store = createStore(memory());
  const b = store.receive(SAMPLE, 'declined');
  store.receive(SAMPLE, 'accepted');
  assert.equal(store.get().bottles.length, 1);
  assert.equal(store.get().bottles[0].status, 'declined');
  assert.throws(() => store.reply(b.id, '回应', true));
  assert.equal(store.get().experiences.length, 0);
});
test('接住后的草稿与完成状态均可恢复，已完成回复不可覆盖', () => {
  const storage = memory(),
    store = createStore(storage),
    b = store.receive(SAMPLE, 'accepted');
  store.reply(b.id, '当时我也这样');
  assert.equal(createStore(storage).get().bottles[0].reply, '当时我也这样');
  store.reply(b.id, '后来我开始投递', true);
  assert.equal(store.get().bottles[0].status, 'replied');
  assert.throws(() => store.reply(b.id, '覆盖'));
});
test('不同漂流实例可独立接收或放行', () => {
  const store = createStore(memory());
  store.receive({ ...SAMPLE, id: 'delivery-1' }, 'declined');
  store.receive({ ...SAMPLE, id: 'delivery-2' }, 'accepted');
  const bottles = store.get().bottles;
  assert.equal(bottles.length, 2);
  assert.deepEqual(bottles.map((b) => b.status).sort(), [
    'accepted',
    'declined',
  ]);
});
test('经历必须本人确认，编辑关闭接收不改变瓶子', () => {
  const store = createStore(memory());
  assert.throws(() =>
    store.experience({ title: '经历', body: '内容', confirmed: false }),
  );
  const e = store.experience({
    title: '经历',
    body: '内容',
    confirmed: true,
    open: true,
  });
  store.send('问题', '目标');
  store.experience({ ...e, body: '补充内容', open: false });
  assert.equal(store.get().experiences.length, 1);
  assert.equal(store.get().experiences[0].open, false);
  assert.equal(store.get().bottles.length, 1);
});
test('发信者邀请回信者后，必须经对方接受才能匿名聊天', () => {
  const store = createStore(memory());
  const bottle = store.send('最近对未来很犹豫', '走过相似阶段的人');
  const contact = store.get().bottles[0].contacts[0];
  store.requestChat(bottle.id, contact.id);
  assert.equal(store.get().bottles[0].contacts[0].chatStatus, 'pending');
  assert.throws(() => store.chat(bottle.id, '谢谢你的回信', contact.id));
  store.decideChat(bottle.id, 'active', contact.id);
  store.chat(bottle.id, '谢谢你的回信', contact.id);
  const savedContact = store.get().bottles[0].contacts[0];
  assert.equal(savedContact.chatStatus, 'active');
  assert.equal(savedContact.chatMessages[0].body, '谢谢你的回信');
});
test('回信者可以婉拒匿名聊天且不能进入对话', () => {
  const store = createStore(memory());
  const bottle = store.receive(SAMPLE, 'accepted');
  store.reply(bottle.id, '我也曾经经历过。', true);
  assert.equal(store.get().bottles[0].chatInvite.status, 'pending');
  store.decideChat(bottle.id, 'declined');
  assert.equal(store.get().bottles[0].chatInvite.status, 'declined');
  assert.throws(() => store.chat(bottle.id, '不会被发送'));
});
test('损坏的存储可恢复，禁止存储时明确提示且保留内存数据', () => {
  const storage = memory();
  storage.setItem(STORAGE_KEY, '{oops');
  const errors = [];
  const store = createStore(storage, (m) => errors.push(m));
  assert.equal(errors.length, 1);
  store.send('问题', '目标');
  assert.equal(store.get().bottles.length, 1);
  const blocked = createStore(
    {
      getItem: () => null,
      setItem: () => {
        throw Error('quota');
      },
    },
    (m) => errors.push(m),
  );
  blocked.send('问题', '目标');
  assert.equal(blocked.get().bottles.length, 1);
  assert.equal(errors.length, 2);
});
