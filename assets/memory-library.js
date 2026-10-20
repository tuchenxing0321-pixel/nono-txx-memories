(function () {
  const database = 'nono-memory-archive';
  const store = 'memories';
  const legacy = 'our-memories-v3';
  const seededKey = 'nono-memory-examples-seeded-v1';

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(store, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法打开本地回忆库'));
    });
  }

  async function transaction(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const table = tx.objectStore(store);
      const request = action(table);
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error('本地数据操作失败'));
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('本地数据保存失败')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('本地数据保存被中断')); };
    });
  }

  function today() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function normalizeImage(image, fallbackDate) {
    if (!image) return null;
    if (typeof image === 'string') {
      return { id: crypto.randomUUID(), data: image, caption: '', uploadedAt: fallbackDate || today() };
    }
    if (!image.data) return null;
    return {
      id: image.id || crypto.randomUUID(),
      data: image.data,
      caption: image.caption || '',
      uploadedAt: image.uploadedAt || fallbackDate || today()
    };
  }

  function normalize(item) {
    const fallbackDate = item.date || item.uploadedAt || today();
    let images = Array.isArray(item.images) ? item.images : [];
    if (!images.length && item.image) images = [item.image];
    images = images.map(image => normalizeImage(image, fallbackDate)).filter(Boolean);
    return {
      ...item,
      kind: item.kind || 'event',
      title: item.title || (item.kind === 'photo' ? '一张照片' : '未命名回忆'),
      date: fallbackDate,
      story: item.story || '',
      place: item.place || '',
      eventType: item.eventType === 'major' ? 'major' : 'minor',
      images
    };
  }

  async function migrateLegacy() {
    if (localStorage.getItem(`${legacy}-migrated`)) return;
    let items = [];
    try { items = JSON.parse(localStorage.getItem(legacy)) || []; } catch (_) {}
    for (const item of items) {
      const image = item.mediaKind === 'image' ? item.mediaUrl || '' : '';
      await put(normalize({ ...item, kind: 'event', image }));
    }
    localStorage.setItem(`${legacy}-migrated`, '1');
  }

  function isoDaysAgo(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  }

  async function seedExamplesIfEmpty() {
    if (localStorage.getItem(seededKey)) return;
    const existing = await transaction('readonly', table => table.count());
    if (existing) {
      localStorage.setItem(seededKey, '1');
      return;
    }
    const startOffset = 260 + Math.floor(Math.random() * 100);
    const examples = [
      {
        id: crypto.randomUUID(), kind: 'event', isExample: true,
        title: '故事从这里开始', date: isoDaysAgo(startOffset),
        story: '这是可替换的示例事件。把它改成属于你们的第一段记忆吧。', place: '', eventType: 'major', images: []
      },
      {
        id: crypto.randomUUID(), kind: 'event', isExample: true,
        title: '一次普通却珍贵的见面', date: isoDaysAgo(startOffset - 36),
        story: '示例内容：也许是一次散步、一顿晚饭，或一句后来一直记得的话。', place: '', eventType: 'minor', images: []
      },
      {
        id: crypto.randomUUID(), kind: 'event', isExample: true,
        title: '把今天也收藏起来', date: isoDaysAgo(Math.max(10, startOffset - 140)),
        story: '示例内容可以直接编辑，也可以删除后记录真实的你们。', place: '', eventType: 'major', images: []
      }
    ];
    for (const item of examples) await put(item);
    localStorage.setItem(seededKey, '1');
  }

  async function all() {
    await migrateLegacy();
    await seedExamplesIfEmpty();
    return (await transaction('readonly', table => table.getAll())).map(normalize);
  }

  function put(item) {
    return transaction('readwrite', table => table.put(normalize(item)));
  }

  function remove(id) {
    return transaction('readwrite', table => table.delete(id));
  }

  function imageFromFile(file) {
    if (!file) return Promise.reject(new Error('请选择图片'));
    if (!file.type.startsWith('image/')) return Promise.reject(new Error(`${file.name || '所选文件'}不是图片`));
    if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error(`${file.name || '图片'}超过 20 MB，请选择较小的图片`));
    return new Promise((resolve, reject) => {
      const image = new Image();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`无法读取 ${file.name || '图片'}`));
      reader.onload = () => { image.src = reader.result; };
      image.onerror = () => reject(new Error(`${file.name || '图片'}无法打开`));
      image.onload = () => {
        try {
          const maxSide = 1920;
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve({
            id: crypto.randomUUID(), data: canvas.toDataURL('image/jpeg', 0.84),
            caption: '', uploadedAt: today()
          });
        } catch (_) {
          reject(new Error(`${file.name || '图片'}处理失败`));
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async function imagesFromFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    if (files.length > 12) throw new Error('一次最多添加 12 张图片');
    const images = [];
    for (const file of files) images.push(await imageFromFile(file));
    return images;
  }

  window.MemoryLibrary = { all, put, remove, imageFromFile, imagesFromFiles, today };
})();
