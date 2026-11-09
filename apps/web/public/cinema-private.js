// Rạp phim riêng (ngăn kéo "🔒 Phòng riêng" trong rạp): tạo phòng xem chung với nhóm bạn, mời bạn đã lưu (người, bạn
// bot) hoặc gửi link, xem / đuổi khách, đóng phòng. Dữ liệu ở API /api/v1/private-rooms (game 'cinema'); máy realtime
// đóng phòng khi chủ phòng rời. Chữ người dùng chỉ đưa ra qua textContent.

export function createCinemaPrivate({ body, privateId, price = 50, notify, onLeave, onClose }) {
  let room = null;
  let mine = null;
  let signedIn = null;
  let ended = null;
  let leaveArmed = false;

  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, onClick, className = '') => {
    const node = el('button', text, `private-btn ${className}`.trim());
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  };
  async function api(path, payload) {
    const response = await fetch(path, payload === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    }).catch(() => null);
    return { ok: Boolean(response?.ok), status: response?.status || 0, data: await response?.json().catch(() => ({})) || {} };
  }
  const ERRORS = {
    insufficient_coins: `Không đủ xu · cần ${price} xu để mở rạp riêng`, not_friends: 'Chỉ mời được bạn bè đã lưu',
    full: 'Phòng đã đủ người được mời', already_member: 'Người này đã được mời', closed: 'Rạp riêng đã đóng',
    not_owner: 'Chỉ chủ phòng mới làm được việc này', not_signed_in: 'Đăng nhập ở cổng chùa để dùng rạp riêng',
  };
  const errorText = (data) => ERRORS[data?.error] || 'Chưa làm được, thử lại sau';
  const linkOf = (roomId) => `${location.origin}/room.html?room=${encodeURIComponent(roomId)}`;

  async function load() {
    if (ended) return render();
    if (privateId) {
      const result = await api(`/api/v1/private-rooms/${privateId}`);
      signedIn = result.status !== 401;
      room = result.ok ? result.data.room : null;
    } else {
      const result = await api('/api/v1/private-rooms/mine?game=cinema');
      signedIn = result.status !== 401;
      mine = result.ok ? result.data.room : null;
    }
    return render();
  }

  async function render() {
    const nodes = [];
    if (ended) {
      nodes.push(el('p', ended, 'private-note warn'), button('🎬 Về rạp chung', onLeave, 'primary'));
      body.replaceChildren(...nodes);
      return;
    }
    if (!privateId) {
      // Rạp chung: giới thiệu + tạo phòng (hoặc quay về phòng đang mở của mình).
      nodes.push(el('p', 'Mở một rạp chỉ có nhóm bạn: chọn phim cùng xem, trò chuyện riêng. Mời bạn bè đã lưu hoặc gửi link cho ai cũng được (người mở link cần đăng nhập).', 'private-note'));
      if (signedIn === false) nodes.push(el('p', 'Đăng nhập ở cổng chùa để mở rạp riêng.', 'private-note warn'));
      else if (mine) nodes.push(button('🔒 Về rạp riêng của bạn', () => { location.href = linkOf(mine.roomId); }, 'primary'));
      else {
        nodes.push(button(`🔒 Tạo rạp riêng · ${price} xu`, async (event) => {
          event.currentTarget.disabled = true;
          const result = await api('/api/v1/private-rooms', { game: 'cinema' });
          if (!result.ok) {
            notify(errorText(result.data));
            render();
            return;
          }
          location.href = linkOf(result.data.room.roomId);
        }, 'primary'));
        nodes.push(el('p', 'Mở phim trong rạp riêng tính phí như rạp chung (giá hiện ở ô Gửi video). Hủy video chưa chiếu, hoặc rạp đóng khi video còn chờ, thì được hoàn tiền. Hàng chờ trống thì chiếu danh sách phim có sẵn.', 'private-note small'));
      }
      body.replaceChildren(...nodes);
      return;
    }
    if (!room) {
      nodes.push(el('p', signedIn === false ? 'Đăng nhập ở cổng chùa để vào rạp riêng.' : 'Đang tải thông tin phòng…', 'private-note'));
      body.replaceChildren(...nodes);
      return;
    }
    nodes.push(el('p', `Chủ phòng: ${room.owner.displayName}`, 'private-head'));
    if (room.isOwner) {
      // Link mời: ai đã đăng nhập mở link là vào được (trừ người đã bị đuổi), không cần kết bạn.
      const link = linkOf(room.roomId);
      const share = el('div', undefined, 'private-link');
      share.append(el('code', link), button('🔗 Gửi link', async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: 'Rạp phim riêng', text: `${room.owner.displayName} mời bạn vào xem phim chung`, url: link });
            return;
          } catch (error) {
            if (error?.name === 'AbortError') return;
          }
        }
        const copied = await navigator.clipboard?.writeText(link).then(() => true, () => false);
        notify(copied ? 'Đã chép link mời · gửi cho bạn qua tin nhắn' : 'Chép link ở ô trên để gửi cho bạn');
      }, 'primary'));
      nodes.push(el('h3', 'Link mời', 'private-title'), el('p', 'Ai có link (đã đăng nhập) đều vào được, không cần kết bạn.', 'private-note small'), share);
    }
    nodes.push(el('h3', `Khách (${room.members.length}/${room.maxGuests})`, 'private-title'));
    if (!room.members.length) nodes.push(el('p', room.isOwner ? 'Chưa có ai. Gửi link hoặc mời bạn bè bên dưới.' : 'Chưa có khách nào.', 'private-note small'));
    for (const member of room.members) {
      const row = el('div', undefined, 'private-row');
      row.append(el('span', member.kind === 'bot' ? member.name : member.displayName));
      if (room.isOwner) {
        row.append(button('Mời ra', async () => {
          const result = await api(`/api/v1/private-rooms/${room.roomId}/kick`, member.kind === 'bot' ? { botName: member.name } : { accountId: member.accountId });
          if (result.ok) room = result.data.room;
          else notify(errorText(result.data));
          render();
        }));
      }
      nodes.push(row);
    }
    if (room.isOwner) {
      const friends = await api('/api/v1/me/friends');
      const invited = new Set(room.members.map((member) => (member.kind === 'bot' ? `bot:${member.name}` : member.accountId)));
      const people = (friends.data.friends || []).filter((friend) => !invited.has(friend.accountId));
      const bots = (friends.data.botFriends || []).filter((bot) => !invited.has(`bot:${bot.name}`));
      nodes.push(el('h3', 'Mời bạn bè', 'private-title'));
      if (!people.length && !bots.length) nodes.push(el('p', 'Không còn bạn nào để mời. Kết bạn ở chánh điện (chạm vào một người rồi chọn Kết bạn).', 'private-note small'));
      for (const [label, payload] of [
        ...people.map((friend) => [`${friend.displayName}${friend.online ? ' · 🟢' : ''}`, { accountId: friend.accountId }]),
        ...bots.map((bot) => [bot.name, { botName: bot.name }]),
      ]) {
        const row = el('div', undefined, 'private-row');
        row.append(el('span', label), button('Mời', async (event) => {
          event.currentTarget.disabled = true;
          const result = await api(`/api/v1/private-rooms/${room.roomId}/invite`, payload);
          if (result.ok) {
            room = result.data.room;
            notify(payload.botName ? `${payload.botName} đã vào rạp` : 'Đã gửi lời mời');
          } else notify(errorText(result.data));
          render();
        }, 'primary'));
        nodes.push(row);
      }
    }
    // Chủ phòng rời = đóng phòng cho cả nhóm: bấm hai lần cho chắc.
    nodes.push(button(room.isOwner ? (leaveArmed ? 'Bấm lần nữa: đóng rạp cho cả nhóm' : '🚪 Đóng rạp riêng') : '🚪 Rời rạp riêng', () => {
      if (room.isOwner && !leaveArmed) {
        leaveArmed = true;
        render();
        setTimeout(() => { leaveArmed = false; render(); }, 4_000);
        return;
      }
      onClose();
    }, 'danger'));
    body.replaceChildren(...nodes);
  }

  // Bị mời ra / phòng đã đóng / không được vào: hiện lý do và nút về rạp chung.
  function gone(text) {
    ended = text;
    render();
  }

  return { load, render, gone, get room() { return room; } };
}
