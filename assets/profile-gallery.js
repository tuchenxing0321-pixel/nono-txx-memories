(function () {
  const database = 'nono-profile-gallery';
  const store = 'photos';
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  let records = [], person = 'girl', managerLayer = 'self';
  const scrollFrames = { self: 0, partner: 0 };
  const autoFrames = { self: 0, partner: 0 };
  const autoPaused = { self: false, partner: false };
  const autoPlaying = { self: true, partner: true };
  const autoTimes = { self: 0, partner: 0 };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const autoDistance = elapsed => Math.min(40, Math.max(0, elapsed)) * .06;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(store, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法打开个人照片库'));
    });
  }

  async function transaction(mode, action) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = action(tx.objectStore(store));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error('个人照片操作失败'));
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('个人照片保存失败')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('个人照片保存被中断')); };
    });
  }

  const all = () => transaction('readonly', table => table.getAll());
  const put = item => transaction('readwrite', table => table.put(item));
  const remove = id => transaction('readwrite', table => table.delete(id));
  const partnerName = () => person === 'girl' ? 'txx' : 'nono';
  const personName = () => person === 'girl' ? 'nono' : 'txx';
  const layerItems = layer => records.filter(item => item.person === person && item.layer === layer).sort((a, b) => a.createdAt - b.createdAt);
  const scrollingItems = items => items.length > 1 ? [...items, ...items, ...items] : items;
  const canAutoScroll = () => !document.hidden && !reducedMotion.matches && document.body.classList.contains('profile-open');
  console.assert(scrollingItems([1]).length === 1 && scrollingItems([1, 2]).length === 6, '个人照片连续轨道计算异常');
  console.assert(Math.abs(autoDistance(1000) - 2.4) < .001 && autoDistance(-1) === 0, '个人照片自动播放计算异常');

  function stopAutoScroll(layer) {
    cancelAnimationFrame(autoFrames[layer]);
    autoFrames[layer] = 0;
    autoTimes[layer] = 0;
  }

  function stopAutoScrollAll() {
    stopAutoScroll('self');
    stopAutoScroll('partner');
  }

  function resumeAutoScroll() {
    if (!canAutoScroll()) return;
    ['self', 'partner'].forEach(layer => startAutoScroll(layer, layerItems(layer).length));
  }

  function updateCentered(layer) {
    const stage = document.querySelector(`[data-stage="${layer}"]`);
    const cards = [...stage.querySelectorAll('.profile-gallery-card')];
    if (!cards.length) return;
    const center = stage.getBoundingClientRect().left + stage.clientWidth / 2;
    const current = cards.reduce((closest, card) => Math.abs(card.getBoundingClientRect().left + card.offsetWidth / 2 - center) < Math.abs(closest.getBoundingClientRect().left + closest.offsetWidth / 2 - center) ? card : closest);
    cards.forEach(card => card.classList.toggle('is-current', card === current));
    const item = records.find(record => record.id === current.dataset.galleryId);
    const meta = document.querySelector(`[data-meta="${layer}"]`);
    meta.innerHTML = layer === 'partner' && item ? `<b>${escapeHtml(item.category || '一张照片')}</b><span>${escapeHtml(item.description || '')}</span>` : '';
  }

  function initializeStage(layer, itemCount) {
    const stage = document.querySelector(`[data-stage="${layer}"]`);
    const cards = [...stage.querySelectorAll('.profile-gallery-card')];
    if (!cards.length) return;
    if (itemCount > 1) {
      const middle = cards[itemCount];
      const nextSet = cards[itemCount * 2];
      const start = middle.offsetLeft - (stage.clientWidth - middle.offsetWidth) / 2;
      stage.dataset.loopStart = String(start);
      stage.dataset.loopWidth = String(nextSet.offsetLeft - middle.offsetLeft);
      stage.scrollLeft = start;
    } else {
      stage.dataset.loopStart = '0';
      stage.dataset.loopWidth = '0';
      stage.scrollLeft = 0;
    }
    updateCentered(layer);
    startAutoScroll(layer, itemCount);
  }

  function startAutoScroll(layer, itemCount) {
    stopAutoScroll(layer);
    if (itemCount < 2 || !canAutoScroll()) return;
    const tick = time => {
      if (!canAutoScroll()) {
        stopAutoScroll(layer);
        return;
      }
      const stage = document.querySelector(`[data-stage="${layer}"]`);
      const elapsed = time - (autoTimes[layer] || time);
      if (autoPlaying[layer] && !autoPaused[layer]) stage.scrollLeft += autoDistance(elapsed);
      autoTimes[layer] = time;
      autoFrames[layer] = requestAnimationFrame(tick);
    };
    autoFrames[layer] = requestAnimationFrame(tick);
  }

  function handleScroll(layer) {
    const stage = document.querySelector(`[data-stage="${layer}"]`);
    const width = Number(stage.dataset.loopWidth || 0);
    const start = Number(stage.dataset.loopStart || 0);
    if (width) {
      if (stage.scrollLeft < start - width * .55) stage.scrollLeft += width;
      else if (stage.scrollLeft > start + width * .55) stage.scrollLeft -= width;
    }
    cancelAnimationFrame(scrollFrames[layer]);
    scrollFrames[layer] = requestAnimationFrame(() => updateCentered(layer));
  }

  function centerCard(card) {
    const stage = card.parentElement;
    stage.scrollTo({ left: card.offsetLeft - (stage.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
  }

  function renderLayer(layer) {
    const items = layerItems(layer);
    const stage = document.querySelector(`[data-stage="${layer}"]`);
    const meta = document.querySelector(`[data-meta="${layer}"]`);
    const playback = document.querySelector(`[data-profile-playback="${layer}"]`);
    playback.hidden = items.length < 2;
    if (!items.length) {
      stopAutoScroll(layer);
      stage.innerHTML = '<div class="profile-gallery-empty">还没有照片<br>点击右上角的 ＋ 添加</div>';
      meta.innerHTML = '';
      return;
    }
    stage.innerHTML = scrollingItems(items).map(item => {
      const label = layer === 'self' ? `${personName()} 选择的照片` : `${item.category || '一张照片'}：${item.description || ''}`;
      return `<button class="profile-gallery-card" type="button" data-gallery-id="${item.id}" aria-label="${escapeHtml(label)}"><img src="${item.image.data}" alt="${escapeHtml(label)}"></button>`;
    }).join('');
    stage.querySelectorAll('.profile-gallery-card').forEach(card => card.onclick = () => centerCard(card));
    requestAnimationFrame(() => initializeStage(layer, items.length));
  }

  function render() {
    $('profilePartnerLabel').textContent = `${partnerName()}觉得`;
    renderLayer('self');
    renderLayer('partner');
  }

  function resetManagerForm() {
    $('profilePhotoForm').reset();
    $('profilePhotoId').value = '';
    $('profilePhotoFile').disabled = false;
    $('profilePhotoFile').required = true;
    $('profilePhotoCategory').required = managerLayer === 'partner';
    $('profilePhotoDescription').required = managerLayer === 'partner';
    $('profileManagerMeta').classList.toggle('is-hidden', managerLayer === 'self');
    $('profilePhotoSave').textContent = '添加照片';
    $('profileEditCancel').hidden = true;
  }

  function renderManagerList() {
    const items = layerItems(managerLayer);
    $('profileManagerList').innerHTML = items.length ? items.map(item => `<div class="profile-manager-item"><img src="${item.image.data}" alt=""><div><b>${escapeHtml(managerLayer === 'self' ? '自己选择' : item.category)}</b><span>${escapeHtml(managerLayer === 'self' ? '不显示文字说明' : item.description)}</span></div><div class="profile-manager-actions">${managerLayer === 'partner' ? `<button type="button" data-profile-edit="${item.id}">编辑</button>` : ''}<button class="profile-remove" type="button" data-profile-remove="${item.id}">删除</button></div></div>`).join('') : '<div class="profile-manager-empty">暂时没有照片</div>';
    $('profileManagerList').querySelectorAll('[data-profile-edit]').forEach(button => button.onclick = () => editItem(button.dataset.profileEdit));
    $('profileManagerList').querySelectorAll('[data-profile-remove]').forEach(button => button.onclick = () => deleteItem(button.dataset.profileRemove));
  }

  async function openManager(layer) {
    managerLayer = layer;
    records = await all();
    $('profileManagerTitle').textContent = layer === 'self' ? '管理 · 自己选择' : `管理 · ${partnerName()} 觉得`;
    $('profileManagerSubtitle').textContent = layer === 'self' ? '只展示照片，不显示文字说明' : '为照片选择类型并写下描述';
    resetManagerForm();
    renderManagerList();
    $('profilePhotoManager').showModal();
  }

  function editItem(id) {
    const item = records.find(record => record.id === id);
    if (!item) return;
    $('profilePhotoId').value = item.id;
    $('profilePhotoCategory').value = item.category || '';
    $('profilePhotoDescription').value = item.description || '';
    $('profilePhotoFile').disabled = true;
    $('profilePhotoFile').required = false;
    $('profilePhotoSave').textContent = '保存修改';
    $('profileEditCancel').hidden = false;
  }

  async function deleteItem(id) {
    if (!confirm('确定删除这张照片吗？删除后无法恢复。')) return;
    try {
      await remove(id);
      records = await all();
      render();
      resetManagerForm();
      renderManagerList();
    } catch (error) {
      alert(error?.message || '照片删除失败，请重试。');
    }
  }

  async function saveForm(event) {
    event.preventDefault();
    const button = $('profilePhotoSave');
    if (button.disabled) return;
    button.disabled = true;
    const editId = $('profilePhotoId').value;
    try {
      if (editId) {
        const item = records.find(record => record.id === editId);
        if (!item) throw new Error('这张照片已不存在');
        await put({ ...item, category: $('profilePhotoCategory').value.trim(), description: $('profilePhotoDescription').value.trim() });
      } else {
        const images = await MemoryLibrary.imagesFromFiles($('profilePhotoFile').files);
        const createdAt = Date.now();
        for (const [index, image] of images.entries()) await put({ id: crypto.randomUUID(), person, layer: managerLayer, category: managerLayer === 'partner' ? $('profilePhotoCategory').value.trim() : '', description: managerLayer === 'partner' ? $('profilePhotoDescription').value.trim() : '', image, createdAt: createdAt + index });
      }
      records = await all();
      render();
      resetManagerForm();
      renderManagerList();
    } catch (error) {
      alert(error?.message || '照片保存失败，请重试。');
    } finally {
      button.disabled = false;
    }
  }

  async function show(nextPerson) {
    person = nextPerson === 'boy' ? 'boy' : 'girl';
    records = await all();
    render();
  }

  document.querySelectorAll('[data-profile-manage]').forEach(button => button.onclick = () => openManager(button.dataset.profileManage).catch(error => alert(error?.message || '无法打开照片管理')));
  document.querySelectorAll('[data-carousel]').forEach(carousel => {
    const layer = carousel.dataset.carousel;
    const stage = document.querySelector(`[data-stage="${layer}"]`);
    carousel.addEventListener('wheel', event => {
      if (stage.scrollWidth <= stage.clientWidth) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      stage.scrollLeft += delta;
    }, { passive: false });
    carousel.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      stage.scrollBy({ left: (event.key === 'ArrowRight' ? 1 : -1) * stage.clientWidth * .58, behavior: 'smooth' });
    });
    carousel.addEventListener('focusin', event => { if (event.target.closest('.profile-gallery-card')) autoPaused[layer] = true; });
    carousel.addEventListener('focusout', event => {
      if (event.target.closest('.profile-gallery-card')) { autoPaused[layer] = false; autoTimes[layer] = performance.now(); }
    });
    stage.addEventListener('pointerover', event => { if (event.target.closest('.profile-gallery-card')) autoPaused[layer] = true; });
    stage.addEventListener('pointerout', event => {
      const card = event.target.closest('.profile-gallery-card');
      if (card && !card.contains(event.relatedTarget)) { autoPaused[layer] = false; autoTimes[layer] = performance.now(); }
    });
    stage.addEventListener('scroll', () => handleScroll(layer), { passive: true });
  });
  document.querySelectorAll('[data-profile-playback]').forEach(button => button.onclick = () => {
    const layer = button.dataset.profilePlayback;
    autoPlaying[layer] = !autoPlaying[layer];
    button.textContent = autoPlaying[layer] ? 'Ⅱ' : '▶';
    button.setAttribute('aria-label', autoPlaying[layer] ? '暂停自动播放' : '继续自动播放');
    autoTimes[layer] = performance.now();
  });
  $('profilePhotoForm').addEventListener('submit', saveForm);
  $('profileEditCancel').onclick = resetManagerForm;
  document.addEventListener('visibilitychange', () => document.hidden ? stopAutoScrollAll() : resumeAutoScroll());
  reducedMotion.addEventListener?.('change', () => reducedMotion.matches ? stopAutoScrollAll() : resumeAutoScroll());

  window.ProfileGallery = {
    show,
    stop: stopAutoScrollAll,
    closeManager() { if ($('profilePhotoManager').open) $('profilePhotoManager').close(); }
  };
})();
