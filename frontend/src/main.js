import '@fontsource-variable/noto-sans-sc';
import './style.css';
import { createWorld } from './scene.js';
import { createStore, SAMPLE } from './store.js';

const $ = (s) => document.querySelector(s);
const escape = (v = '') =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
let toastTimer;
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}
let storage;
await document.fonts.load('400 16px "Noto Sans SC Variable"', '我的经历');
try {
  storage = localStorage;
} catch {
  storage = {
    getItem: () => null,
    setItem: () => {
      throw Error('unavailable');
    },
  };
}
const store = createStore(storage, toast);
let view = 'home',
  mode = 'receive',
  tab = 'received',
  page = 0,
  activeRecord = null,
  activeContact = null,
  editingExperience = null,
  world,
  transitioning = false,
  sending = false,
  launchMessage = '',
  lastFocus = null,
  uncorking = false,
  pickingUp = false,
  currentIncoming = SAMPLE;
const sheet = $('#sheet');
const iconArrow = '<span aria-hidden="true">↗</span>';
const btn = (action, text, cls = 'text-button') =>
  `<button class="${cls}" data-action="${action}">${text}</button>`;
const closeButton = () =>
  '<button class="close" data-action="close" aria-label="关闭">×</button>';
const makeIncoming = () => ({
  ...SAMPLE,
  id: `${SAMPLE.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
});

function updateScene() {
  world?.setSampleVisible(true);
  world?.updateCabinet();
}
function setView(next) {
  view = next;
  document.body.dataset.view = next;
  world?.go(next);
  renderNavigation();
  updateScene();
}
function renderNavigation() {
  const captions = {
    home: ['001', '一片属于你的海。', '写下正在经历的事，让走过的人回应你。'],
    island: [
      '002',
      '靠近一点，故事就开始了。',
      '点进小屋，收好来信，也记下你走过的路。',
    ],
    room: [
      '003',
      '每一段经历，都有回声。',
      '左边收好来往的瓶子，右边记下自己的经历。',
    ],
    cabinet: ['004', '那些来过的信。', '点击一只瓶子，重读一段相遇。'],
    diary: ['005', '你走过的路，值得被记下。', '属于你的长期日记。'],
    bottle: [
      '006',
      pickingUp
        ? mode === 'write'
          ? '取来一只属于你的空瓶。'
          : '把它从海面拾起。'
        : mode === 'write'
          ? '给未来的相遇，留一句话。'
          : '海面捎来了一封信。',
      pickingUp
        ? mode === 'write'
          ? '写好以后，再亲手把它抛进海里。'
          : '等海水从瓶身滑落。'
        : '按住瓶塞向上拖动，打开看看。',
    ],
  };
  const c = captions[view];
  $('#caption').innerHTML =
    `<div class="chapter"><span>${c[0]}</span><i></i><span class="chapter-side">YOUR LITTLE ISLAND</span></div><h1>${c[1]
      .split('')
      .map((s, i) => `<span style="--i:${i}">${s}</span>`)
      .join('')}</h1><p>${c[2]}</p>`;
  const links = {
    home:
      btn('island', '靠近小岛 ' + iconArrow) +
      btn('receive', '接收一个瓶子 ' + iconArrow) +
      btn('write', '抛出一个瓶子 ' + iconArrow),
    island:
      btn('room', '进入小屋 ' + iconArrow) +
      btn('receive', '接收一个瓶子') +
      btn('write', '抛出一个瓶子') +
      btn('home', '远离小岛'),
    room:
      btn('cabinet', '查看瓶子柜 ' + iconArrow) +
      btn('diary', '我的经历 ' + iconArrow) +
      btn('island', '返回小岛'),
    cabinet: btn('records', '展开记录 ' + iconArrow) + btn('room', '回到小屋'),
    diary: btn('diary', '打开日记 ' + iconArrow) + btn('room', '回到小屋'),
    bottle: pickingUp
      ? `<span class="pickup-status"><i></i>${mode === 'write' ? '正在取出空瓶' : '正在拾起来信'}</span>`
      : btn('uncork', mode === 'write' ? '打开空瓶 ↑' : '打开来信 ↑') +
        btn('home', '稍后再看'),
  };
  $('#navigation').innerHTML = links[view];
  let hotspots = '';
  if (['home', 'island'].includes(view)) {
    hotspots += `<button class="hotspot" data-anchor="house" data-action="${view === 'home' ? 'island' : 'room'}" aria-label="${view === 'home' ? '靠近小岛' : '进入小屋'}"><i></i><span>${view === 'home' ? '靠近小岛' : '进入小屋'}</span></button>`;
    hotspots +=
      '<button class="hotspot bottle-hotspot" data-anchor="bottle" data-action="bottle" aria-label="捡起示例来信"><i></i><span>一封示例来信</span></button>';
  }
  if (view === 'room')
    hotspots =
      '<button class="hotspot" data-anchor="cabinet" data-action="cabinet" aria-label="查看瓶子柜"><i></i><span>瓶子柜</span></button><button class="hotspot" data-anchor="diary" data-action="diary" aria-label="打开我的经历日记"><i></i><span>我的经历</span></button>';
  if (view === 'bottle' && !pickingUp)
    hotspots =
      '<div class="cork-hint" data-anchor="cork"><i></i><span>向上拖开瓶塞 ↑</span></div>';
  $('#hotspots').innerHTML = hotspots;
}
function openSheet(content, kind = 'letter') {
  lastFocus = document.activeElement;
  sheet.className = kind;
  $('#sheet-content').innerHTML = content;
  if (!sheet.open) sheet.showModal();
  document.body.classList.add('reading');
  const focus = sheet.querySelector('h2');
  if (focus) {
    focus.tabIndex = -1;
    focus.focus({ preventScroll: true });
  }
}
function closeSheet() {
  sheet.close();
  document.body.classList.remove('reading');
  uncorking = false;
  if (view === 'diary') setView('room');
  else if (view === 'bottle') setView('home');
  const restore = lastFocus?.isConnected ? lastFocus : $('#navigation button');
  restore?.focus({ preventScroll: true });
}
sheet.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeSheet();
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) {
    const r = sheet.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeSheet();
  }
});

function showWrite() {
  const draft = store.get().draft;
  openSheet(
    `${closeButton()}<div class="eyebrow">A LETTER TO SOMEONE WHO HAS BEEN THERE</div><h2>最近，你在演哪一集？</h2><p class="subtext">不必整理好措辞。从眼下最想说的事开始。</p><form id="write-form"><label for="bottle-body">你正在经历什么？</label><textarea id="bottle-body" name="body" required rows="5" placeholder="比如，准备第一份实习，却总觉得自己还没准备好……">${escape(draft.body)}</textarea><div class="prompts">${['第一次找实习', '在读研与就业之间犹豫', '想换一个方向'].map((t) => btn('prompt:' + t, t, 'chip')).join('')}</div><label for="bottle-target">想听走过哪段路的人说说？</label><textarea id="bottle-target" name="target" required rows="2" placeholder="比如，也经历过求职受挫、后来继续尝试的人。">${escape(draft.target)}</textarea><footer class="form-footer"><span>仅在此浏览器保存 · 不会真实发送</span><button class="primary" type="submit">装好，抛向海面 ${iconArrow}</button></footer></form>`,
  );
  $('#write-form').addEventListener('input', () =>
    store.draft($('#bottle-body').value, $('#bottle-target').value),
  );
  $('#write-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (sending) return;
    try {
      store.send($('#bottle-body').value, $('#bottle-target').value);
      launch('瓶子已收好。你可以继续写一只新的。');
    } catch (error) {
      toast(error.message);
    }
  });
}
function showIncoming() {
  openSheet(
    `${closeButton()}<div class="eyebrow">来自海上的一封信 <span class="badge">示例来信</span></div><h2>第一次找实习，<br>我总觉得自己还不够格。</h2><p class="letter-copy">${escape(currentIncoming.body.split('\n\n').slice(1).join('\n\n'))}</p><div class="wanted"><small>TA 想听谁的经历</small><p>${escape(currentIncoming.target)}</p></div><p class="subtext">如果你亲自走过这段路，可以接住；这次不想聊，也没关系。</p><div class="receive-actions">${btn('accept', '我演过，接住这封信', 'primary')}${btn('decline', '这次不聊')}${btn('not-me', '我没经历过')}</div><p class="fine-print">这是操作示例，不是根据你的经历匹配的真人来信。</p>`,
  );
}
function showRecord(id) {
  const b = store.get().bottles.find((x) => x.id === id);
  if (!b) return;
  activeRecord = id;
  activeContact = null;
  const replyForm =
    b.status === 'accepted'
      ? `<form id="reply-form"><label for="reply-body">说一句，当时你也想听的话。</label><p class="subtext">当时我以为…… / 后来我才发现……</p><textarea id="reply-body" rows="5" required placeholder="从你的真实经历说起。">${escape(b.reply)}</textarea><footer class="form-footer"><span>草稿自动保存在此浏览器</span><button class="primary" type="submit">收好回信，放回海面 ${iconArrow}</button></footer></form>`
      : b.status === 'replied'
        ? `<div class="reply-saved"><small>我的回应</small><p class="letter-copy">${escape(b.reply)}</p></div>`
        : '';
  const contacts =
    b.kind === 'sent'
      ? `<section class="connection-panel"><div class="connection-heading"><div><small>ANONYMOUS CONNECTIONS</small><h3>因这只瓶子，相遇的人</h3></div><span>${b.contacts?.length || 0}</span></div><p class="subtext">点开一位回信者，可以重读 TA 的回应。觉得被接住了，再由你发出匿名聊天邀请。</p><div class="contact-list">${
          b.contacts
            ?.map(
              (contact, index) =>
                `<button class="contact-card" data-action="contact:${contact.id}"><span class="contact-mark">${String(index + 1).padStart(2, '0')}</span><span class="contact-copy"><strong>${escape(contact.alias)}</strong><small>${escape(contact.experience)}</small><em>${escape(contact.reply.slice(0, 45))}${contact.reply.length > 45 ? '…' : ''}</em></span><span class="contact-state ${contact.chatStatus}">${contact.chatStatus === 'active' ? '聊天中' : contact.chatStatus === 'pending' ? '待接受' : contact.chatStatus === 'declined' ? '已婉拒' : '查看回信'}</span></button>`,
            )
            .join('') || '<p class="connection-empty">海面还没有捎回回应。</p>'
        }</div></section>`
      : '';
  const incomingChat =
    b.kind === 'received' && b.status === 'replied' && b.chatInvite
      ? `<section class="chat-invite ${b.chatInvite.status}"><small>ANONYMOUS CHAT</small><h3>${b.chatInvite.status === 'pending' ? '发信者想再和你聊一会儿' : b.chatInvite.status === 'active' ? '你们的匿名聊天已经打开' : '这次邀请已经放回海里'}</h3><p>${b.chatInvite.status === 'pending' ? 'TA 觉得你的回信很有帮助。接受后，你们仍只使用匿名身份交谈。' : b.chatInvite.status === 'active' ? '聊天属于这只瓶子，不会公开个人主页或真实身份。' : '拒绝不会影响你的经历，也不会留下任何负面记录。'}</p><div class="receive-actions">${b.chatInvite.status === 'pending' ? btn('accept-chat', '接受匿名聊天', 'primary') + btn('decline-chat', '暂时不聊') : b.chatInvite.status === 'active' ? btn('open-chat', '进入聊天窗口 ' + iconArrow, 'primary') : ''}</div></section>`
      : '';
  openSheet(
    `${closeButton()}<div class="eyebrow">${b.kind === 'sent' ? '我抛出的瓶子' : '我接住的瓶子'} · ${b.kind === 'sent' ? '本地交互演示' : '示例来信'}</div><h2>${b.kind === 'sent' ? '写给走过这段路的人。' : '你接住了这一集。'}</h2><section class="original-letter"><small>瓶中原信</small><p class="letter-copy">${escape(b.body)}</p><div class="wanted"><small>想听谁的经历</small><p>${escape(b.target)}</p></div></section>${replyForm}${contacts}${incomingChat}<p class="fine-print">当前为本地交互演示，回信、邀请和聊天都只保存在此浏览器。</p>${btn('records', '← 返回瓶子柜')}`,
    b.kind === 'sent' ? 'letter connection-sheet' : 'letter',
  );
  if (b.status === 'accepted') {
    $('#reply-body').addEventListener('input', () =>
      store.reply(id, $('#reply-body').value),
    );
    $('#reply-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (sending) return;
      try {
        store.reply(id, $('#reply-body').value, true);
        launch('回信已保存，瓶子回到了海上。');
      } catch (error) {
        toast(error.message);
      }
    });
  }
}

function showContact(contactId) {
  const b = store.get().bottles.find((x) => x.id === activeRecord);
  const contact = b?.contacts?.find((x) => x.id === contactId);
  if (!b || !contact) return records();
  activeContact = contactId;
  const actionArea =
    contact.chatStatus === 'none'
      ? `<div class="chat-call"><p>如果这封回信真的接住了你，可以邀请 TA 继续匿名聊聊。对方同意后，聊天窗口才会打开。</p>${btn('request-chat', '发出匿名聊天邀请 ' + iconArrow, 'primary')}</div>`
      : contact.chatStatus === 'pending'
        ? `<div class="chat-call pending"><i></i><div><strong>邀请已经漂向对方</strong><p>等待对方选择接受或婉拒。</p></div></div><div class="demo-decision"><small>本地演示 · 切换到回信者的选择</small><div>${btn('demo-accept-chat', '接受邀请', 'primary')}${btn('demo-decline-chat', '婉拒')}</div></div>`
        : contact.chatStatus === 'active'
          ? `<div class="chat-call active"><p>对方接受了邀请。你们仍以匿名身份交谈。</p>${btn('open-chat', '进入匿名聊天 ' + iconArrow, 'primary')}</div>`
          : `<div class="chat-call declined"><p>对方这次没有接受。瓶中原信和回信仍会留在柜子里。</p></div>`;
  openSheet(
    `${closeButton()}<div class="eyebrow">由这只瓶子联系起来</div><div class="contact-profile"><span>∿</span><div><h2>${escape(contact.alias)}</h2><p>${escape(contact.experience)}</p></div></div><section class="received-letter"><small>TA 寄回的信</small><p class="letter-copy">${escape(contact.reply)}</p></section>${actionArea}${btn('back-record', '← 回到这只瓶子')}`,
    'letter connection-sheet',
  );
}

function showChat() {
  const b = store.get().bottles.find((x) => x.id === activeRecord);
  if (!b) return records();
  const contact =
    b.kind === 'sent' ? b.contacts?.find((x) => x.id === activeContact) : null;
  const status = contact?.chatStatus ?? b.chatInvite?.status;
  if (status !== 'active') return showRecord(b.id);
  const messages = contact?.chatMessages ?? b.chatMessages ?? [];
  const alias = contact?.alias ?? '匿名发信者';
  openSheet(
    `${closeButton()}<div class="chat-shell"><header class="chat-header"><button data-action="${b.kind === 'sent' ? 'back-contact' : 'back-record'}" aria-label="返回">←</button><div><small>ANONYMOUS CHAT</small><h2>${escape(alias)}</h2></div><span><i></i> 由一只瓶子相连</span></header><div class="chat-origin"><small>最初的瓶中信</small><p>${escape(b.body.slice(0, 86))}${b.body.length > 86 ? '…' : ''}</p></div><div class="message-list" aria-live="polite">${messages.map((message) => `<div class="message ${message.side}"><p>${escape(message.body)}</p><small>${new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') || '<div class="chat-empty"><span>∿</span><p>聊天从这里开始。<br>仍然不需要交换真实身份。</p></div>'}</div><form id="chat-form" class="chat-form"><label for="chat-body">写给 ${escape(alias)}</label><textarea id="chat-body" rows="2" required placeholder="继续聊聊这段经历……"></textarea><button class="primary" type="submit">送出 ${iconArrow}</button></form><p class="fine-print">匿名聊天仅属于这次瓶子相遇。本地演示不会真实发送。</p></div>`,
    'chat-sheet',
  );
  $('#chat-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      store.chat(b.id, $('#chat-body').value, contact?.id);
      showChat();
      toast('消息已经送到这段匿名对话里。');
    } catch (error) {
      toast(error.message);
    }
  });
}

function recordStatus(bottle) {
  if (bottle.kind === 'sent') {
    const contacts = bottle.contacts ?? [];
    const active = contacts.filter(
      (contact) => contact.chatStatus === 'active',
    ).length;
    const pending = contacts.filter(
      (contact) => contact.chatStatus === 'pending',
    ).length;
    if (active) return `${active} 段匿名聊天进行中`;
    if (pending) return `${pending} 份聊天邀请待接受`;
    if (contacts.length) return `收到 ${contacts.length} 封回信 · 可匿名联系`;
    return '正在海上漂流';
  }
  if (bottle.status === 'accepted') return '已接住 · 待回应';
  if (bottle.chatInvite?.status === 'pending') return '新的匿名聊天邀请';
  if (bottle.chatInvite?.status === 'active') return '匿名聊天进行中';
  return bottle.status === 'replied' ? '回应已保存' : '已接住';
}

function records() {
  setView('cabinet');
  const all = store
    .get()
    .bottles.filter((b) => b.kind === tab && b.status !== 'declined');
  page = Math.min(page, Math.max(0, Math.ceil(all.length / 6) - 1));
  updateScene();
  openSheet(
    `${closeButton()}<div class="eyebrow">THE BOTTLE CABINET</div><h2>来过的信，都收在这里。</h2><div class="tabs" role="tablist"><button role="tab" aria-selected="${tab === 'received'}" data-action="tab:received">已接收</button><button role="tab" aria-selected="${tab === 'sent'}" data-action="tab:sent">已发出</button></div><div class="record-list">${
      all
        .slice(page * 6, page * 6 + 6)
        .map(
          (b, i) =>
            `<button data-action="open:${b.id}" class="record"><span class="record-number">${String(page * 6 + i + 1).padStart(2, '0')}</span><span><strong>${escape(b.body.slice(0, 42))}${b.body.length > 42 ? '…' : ''}</strong><small>${recordStatus(b)}</small></span><span>↗</span></button>`,
        )
        .join('') ||
      `<div class="empty"><span>∿</span><h3>${tab === 'received' ? '还没有接住的瓶子' : '这里等着你的第一只瓶子'}</h3><p>${tab === 'received' ? '查看来信后，选择「接住」才会收到这里。' : '每次抛出都会保存一份独立记录。'}</p>${btn(tab === 'received' ? 'receive' : 'write', tab === 'received' ? '接收一个瓶子' : '写一只瓶子', 'primary')}</div>`
    }</div><div class="pagination">${page > 0 ? btn('prev', '← 上一页') : ''}<span>${page + 1} / ${Math.max(1, Math.ceil(all.length / 6))}</span>${(page + 1) * 6 < all.length ? btn('next', '下一页 →') : ''}</div>`,
    'cabinet-sheet',
  );
}
function diary(id = null) {
  setView('diary');
  editingExperience = id;
  const entries = store.get().experiences;
  const e = entries.find((x) => x.id === id) || {
    title: '',
    body: '',
    confirmed: false,
    open: false,
  };
  openSheet(
    `${closeButton()}<div class="book-spread"><section class="book-left"><div class="eyebrow">MY CHAPTERS</div><h2>我走过的经历</h2><p class="subtext">没有成功的那一段，也算。</p><div class="diary-entries">${entries.map((x, i) => `<button class="diary-entry ${x.id === id ? 'selected' : ''}" data-action="experience:${x.id}"><small>${String(i + 1).padStart(2, '0')}</small><strong>${escape(x.title)}</strong><span>${x.open ? '愿意接收相关来信' : '暂不接收来信'}</span></button>`).join('') || '<p class="diary-empty">翻开新的一页。<br>记下你真正走过，<br>现在能回头讲述的一段路。</p>'}</div>${btn('new-experience', '＋ 写下一段经历', 'new-entry')}<p class="book-note">经历会一直保留，<br>与瓶子分开保存。</p></section><section class="book-right"><div class="eyebrow">${id ? 'REVISIT A CHAPTER' : 'A NEW CHAPTER'}</div><h3>${id ? '回头看看这一段' : '写下一段经历'}</h3><form id="diary-form"><label for="experience-title">给这一段起个名字</label><input id="experience-title" required placeholder="比如，第一次找实习" value="${escape(e.title)}"><label for="experience-body">你走过了什么？</label><textarea id="experience-body" class="ruled" required rows="6" placeholder="当时发生了什么，后来又怎样了……">${escape(e.body)}</textarea><label class="check"><input id="confirmed" type="checkbox" required ${e.confirmed ? 'checked' : ''}>这段经历确实发生在我身上</label><label class="check switch-label"><input id="receive-open" type="checkbox" role="switch" ${e.open ? 'checked' : ''}>愿意接收相关来信</label><p class="fine-print">只保存你写下的经历，不展示姓名或个人主页。接收意愿可以随时修改。</p><button type="submit" class="primary full">保存经历 ${iconArrow}</button><p id="diary-saved" role="status" class="save-status"></p></form></section></div>`,
    'diary-sheet',
  );
  $('#diary-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    try {
      const saved = store.experience({
        id: editingExperience,
        title: $('#experience-title').value,
        body: $('#experience-body').value,
        confirmed: $('#confirmed').checked,
        open: $('#receive-open').checked,
      });
      diary(saved.id);
      $('#diary-saved').textContent = '这一页，已经保存。';
      toast('经历已独立保存。');
    } catch (error) {
      toast(error.message);
    }
  });
}
function launch(message) {
  sending = true;
  launchMessage = message;
  sheet.close();
  document.body.classList.remove('reading');
  view = 'home';
  document.body.dataset.view = 'home';
  renderNavigation();
  $('#navigation').inert = true;
  $('#hotspots').inert = true;
  world?.launch();
  if (!world) setTimeout(() => action('landed'), 100);
}
function prepareBottle(nextMode) {
  if (sheet.open) closeSheet();
  mode = nextMode;
  if (nextMode === 'receive') currentIncoming = makeIncoming();
  uncorking = false;
  pickingUp = true;
  world?.setBottleKind(nextMode);
  setView('bottle');
}
function action(a) {
  if (sending && a !== 'landed') return;
  if (a.startsWith('open:')) {
    showRecord(a.slice(5));
    return;
  }
  if (a.startsWith('contact:')) {
    showContact(a.slice(8));
    return;
  }
  if (a.startsWith('experience:')) {
    diary(a.slice(11));
    return;
  }
  if (a.startsWith('tab:')) {
    tab = a.slice(4);
    page = 0;
    records();
    return;
  }
  if (a.startsWith('prompt:')) {
    const field = $('#bottle-body');
    if (field && !field.value) {
      field.value = a.slice(7) + '，';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
    }
    return;
  }
  switch (a) {
    case 'picked':
      if (view !== 'bottle') return;
      pickingUp = false;
      renderNavigation();
      break;
    case 'home':
      if (sheet.open) closeSheet();
      setView('home');
      break;
    case 'island':
      if (sheet.open) closeSheet();
      setView('island');
      break;
    case 'house':
      action(view === 'home' ? 'island' : 'room');
      break;
    case 'room':
      if (sheet.open) closeSheet();
      document.body.classList.add('room-transition');
      setTimeout(() => {
        setView('room');
        document.body.classList.remove('room-transition');
      }, 180);
      break;
    case 'cabinet':
      if (sheet.open) closeSheet();
      setView('cabinet');
      break;
    case 'records':
      records();
      break;
    case 'back-record':
      showRecord(activeRecord);
      break;
    case 'back-contact':
      showContact(activeContact);
      break;
    case 'request-chat':
      try {
        store.requestChat(activeRecord, activeContact);
        showContact(activeContact);
        toast('匿名聊天邀请已经发出。');
      } catch (error) {
        toast(error.message);
      }
      break;
    case 'demo-accept-chat':
      try {
        store.decideChat(activeRecord, 'active', activeContact);
        showChat();
        toast('对方接受了邀请，聊天窗口已经打开。');
      } catch (error) {
        toast(error.message);
      }
      break;
    case 'demo-decline-chat':
      try {
        store.decideChat(activeRecord, 'declined', activeContact);
        showContact(activeContact);
        toast('对方暂时没有接受邀请。');
      } catch (error) {
        toast(error.message);
      }
      break;
    case 'accept-chat':
      try {
        store.decideChat(activeRecord, 'active');
        showChat();
        toast('你接受了这次匿名聊天。');
      } catch (error) {
        toast(error.message);
      }
      break;
    case 'decline-chat':
      try {
        store.decideChat(activeRecord, 'declined');
        showRecord(activeRecord);
        toast('邀请已婉拒，不会影响这封回信。');
      } catch (error) {
        toast(error.message);
      }
      break;
    case 'open-chat':
      showChat();
      break;
    case 'diary':
      diary();
      break;
    case 'new-experience':
      diary();
      break;
    case 'write':
      prepareBottle('write');
      break;
    case 'sample':
    case 'receive':
    case 'bottle':
      prepareBottle('receive');
      break;
    case 'uncork':
      if (view !== 'bottle' || pickingUp || uncorking) return;
      uncorking = true;
      world?.uncork();
      setTimeout(() => {
        if (view === 'bottle' && uncorking)
          mode === 'write' ? showWrite() : showIncoming();
      }, 350);
      break;
    case 'accept': {
      const b = store.receive(currentIncoming, 'accepted');
      showRecord(b.id);
      updateScene();
      break;
    }
    case 'decline':
    case 'not-me':
      store.receive(currentIncoming, 'declined');
      launch(
        a === 'not-me'
          ? '瓶子已抛回海面，继续漂流。'
          : '这次不聊也没关系。瓶子继续漂流。',
      );
      break;
    case 'landed':
      sending = false;
      $('#navigation').inert = false;
      $('#hotspots').inert = false;
      updateScene();
      renderNavigation();
      toast(launchMessage);
      break;
    case 'close':
      closeSheet();
      break;
    case 'prev':
      page = Math.max(0, page - 1);
      records();
      break;
    case 'next':
      page++;
      records();
      break;
    case 'about':
      openSheet(
        `${closeButton()}<div class="eyebrow">关于这片海</div><h2>这一集，有人演过。</h2><p class="letter-copy">写下正在经历的事，听走过同一段路的人说说。也可以在日记里留下自己的经历。</p><div class="wanted"><p>当前是前端本地体验。瓶子、回应和经历保存在此浏览器；清除站点数据会丢失，不支持跨设备同步。尚未接入账户、AI 或真人消息，示例不会冒充真实匹配。</p></div>${btn('close', '回到海边', 'primary')}`,
      );
      break;
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (b) action(b.dataset.action);
});

try {
  world = createWorld($('#scene'), action, (anchors) => {
    for (const el of document.querySelectorAll('[data-anchor]')) {
      const p = anchors[el.dataset.anchor];
      if (!p) continue;
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.style.visibility = p.visible ? 'visible' : 'hidden';
    }
  });
  updateScene();
} catch (error) {
  console.error(error);
  document.body.classList.add('no-webgl');
  toast('此设备暂不支持三维画面，仍可通过下方入口操作。');
}
setView('home');
requestAnimationFrame(() =>
  setTimeout(() => $('#loading').classList.add('loaded'), 450),
);
// The luminous pointer belongs to the 3D scene; paper views use native cursors.
const cursor = $('#cursor');
let cursorX = innerWidth / 2,
  cursorY = innerHeight / 2,
  targetX = cursorX,
  targetY = cursorY;
document.addEventListener('pointermove', (e) => {
  targetX = e.clientX;
  targetY = e.clientY;
  if (document.body.classList.contains('reading')) {
    cursor.classList.remove('visible', 'interactive', 'pressed');
    return;
  }
  cursor.classList.add('visible');
  cursor.classList.toggle(
    'interactive',
    !!e.target.closest('button,a,[data-action]'),
  );
});
document.addEventListener('pointerdown', () => cursor.classList.add('pressed'));
document.addEventListener('pointerup', () =>
  cursor.classList.remove('pressed'),
);
document.addEventListener('pointercancel', () =>
  cursor.classList.remove('pressed'),
);
document.addEventListener('pointerout', (e) => {
  if (!e.relatedTarget) cursor.classList.remove('visible');
});
function cursorFrame() {
  cursorX += (targetX - cursorX) * 0.4;
  cursorY += (targetY - cursorY) * 0.4;
  cursor.style.left = cursorX + 'px';
  cursor.style.top = cursorY + 'px';
  requestAnimationFrame(cursorFrame);
}
cursorFrame();
let audioContext,
  audioGain,
  soundOn = false;
$('#sound').addEventListener('click', async () => {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
      const n = audioContext.sampleRate * 4,
        buffer = audioContext.createBuffer(1, n, audioContext.sampleRate),
        data = buffer.getChannelData(0);
      let prev = 0;
      for (let i = 0; i < n; i++) {
        prev = (prev + Math.random() * 0.04 - 0.02) * 0.985;
        data[i] = prev;
      }
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;
      audioGain = audioContext.createGain();
      audioGain.gain.value = 0;
      source
        .connect(filter)
        .connect(audioGain)
        .connect(audioContext.destination);
      source.start();
    }
    await audioContext.resume();
    soundOn = !soundOn;
    audioGain.gain.setTargetAtTime(
      soundOn ? 0.32 : 0,
      audioContext.currentTime,
      0.4,
    );
    $('#sound').innerHTML = `声音 ${soundOn ? '开' : '关'} <span>≋</span>`;
    $('#sound').setAttribute(
      'aria-label',
      soundOn ? '关闭海浪声音' : '开启海浪声音',
    );
  } catch {
    toast('当前浏览器无法播放声音。');
  }
});
document.addEventListener('visibilitychange', () => {
  if (!audioContext) return;
  if (document.hidden) audioContext.suspend();
  else if (soundOn) audioContext.resume();
});
