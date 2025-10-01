// DELETE ALL COMMENTS. This script deletes any comment you've ever made. Works for all Comments in Activity Feed in your profile.
// Just paste into dev console in browser.

(() => {
  // CONFIG
  const cfg = {
    perClickDelayMs: 1300,
    menuOpenWaitMs: 350,
    confirmWaitMs: 350,
    sweepPauseMs: 800,
    scrollStepPx: 900,
    scrollPauseMs: 900,
    maxRetries: 2,
    maxPerRun: Infinity // set to a number (e.g. 25) if you want a hard cap per run
  };

  // STATE
  let running = false;
  let totalDeleted = 0;
  let meProfilePath = null; // "/in/your-slug"

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const pc = el => {
    const o = { bubbles: true, cancelable: true, view: window };
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", o));
      el.dispatchEvent(new MouseEvent("mousedown", o));
      el.dispatchEvent(new PointerEvent("pointerup", o));
      el.dispatchEvent(new MouseEvent("mouseup", o));
      el.dispatchEvent(new MouseEvent("click", o));
    } catch { el.click(); }
  };
  const mark = el => { try { el.style.outline = "2px solid red"; el.style.scrollMargin = "120px"; } catch {} };

  // Discover your profile path once (locale proof)
  const discoverMe = () => {
    if (meProfilePath) return meProfilePath;
    // 1) try any comment that carries the "You" badge and read its author href
    const candidates = [...document.querySelectorAll('article.comments-comment-entity .comments-comment-meta__description-container[href*="/in/"]')];
    for (const a of candidates) {
      const meta = a.closest('.comments-comment-meta__actor')?.parentElement?.querySelector('.comments-comment-meta__description');
      const txt = (meta?.textContent || '').toLowerCase();
      if (txt.includes('• you') || txt.includes('· you') || /\byou\b/.test(txt)) {
        const u = new URL(a.href, location.origin);
        meProfilePath = u.pathname; // "/in/your-slug"
        break;
      }
    }
    // 2) fall back to global nav "Me" link if present
    if (!meProfilePath) {
      const navMe = document.querySelector('a[href*="/in/"][data-test-app-aware-link], a.global-nav__secondary-link[href*="/in/"], a[href*="/in/"].global-nav__me-photo');
      if (navMe) {
        const u = new URL(navMe.href, location.origin);
        meProfilePath = u.pathname;
      }
    }
    return meProfilePath;
  };

  // Is this comment authored by you, based on profile URL match
  const isYourCommentEntity = art => {
    if (!art || !visible(art)) return false;
    if (!art.classList?.contains('comments-comment-entity')) return false;
    const mePath = discoverMe();
    if (!mePath) return false; // cannot verify author reliably
    const authorLink = art.querySelector('.comments-comment-meta__description-container[href*="/in/"]');
    if (!authorLink) return false;
    try {
      const u = new URL(authorLink.href, location.origin);
      return u.pathname === mePath;
    } catch { return false; }
  };

  // Find the three dots for the comment (not the post)
  const getCommentMenuBtn = art => {
    const container = art.querySelector('.comment-options-trigger') || art;
    const candidates = container.querySelectorAll('button, [role=button]');
    for (const b of candidates) {
      if (!visible(b)) continue;
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const cls = b.className || '';
      // e.g. "Open options for YourUserName comment"
      const looksLike = (aria.includes('options') && aria.includes('comment')) || /artdeco-dropdown__trigger/.test(cls);
      if (looksLike) return b;
    }
    return null;
  };

  // From the opened dropdown, pick Delete
  const findDeleteInOpenMenus = () => {
    const nodes = [...document.querySelectorAll(
      '.comment-options-dropdown__option-text, button, a[role=menuitem], div[role=menuitem]'
    )];
    return nodes.find(n => {
      if (!visible(n)) return false;
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return t === 'delete';
    }) || null;
  };

  const confirmDeleteIfModal = async () => {
    await sleep(cfg.confirmWaitMs);
    const btn = [...document.querySelectorAll('button, [role=button]')]
      .find(b => visible(b) && /^delete$/i.test((b.textContent || '').trim()));
    if (btn) { pc(btn); await sleep(cfg.perClickDelayMs); }
  };

  const commentGone = art => !art.isConnected || !getCommentMenuBtn(art);

  const deleteOne = async art => {
    let tries = 0;
    while (tries++ <= cfg.maxRetries) {
      if (!art || !visible(art)) return false;
      art.scrollIntoView({ block: 'center' });
      mark(art);

      const menuBtn = getCommentMenuBtn(art);
      if (!menuBtn) return false;
      pc(menuBtn);
      await sleep(cfg.menuOpenWaitMs);

      const del = findDeleteInOpenMenus();
      if (!del) { document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(200); continue; }
      pc(del);
      await confirmDeleteIfModal();
      await sleep(cfg.perClickDelayMs);

      if (commentGone(art)) { totalDeleted++; return true; }
    }
    return false;
  };

  const getYourCommentArticles = () =>
    [...document.querySelectorAll('article.comments-comment-entity')].filter(isYourCommentEntity);

  const sweep = async () => {
    const items = getYourCommentArticles();
    console.log(`Found ${items.length} of your comments`);
    let did = 0;
    for (const a of items) {
      if (!running) break;
      if (totalDeleted >= cfg.maxPerRun) { running = false; break; }
      if (await deleteOne(a)) did++;
    }
    return did;
  };

  // Only lazy-scroll page to fetch the next posts. Never click "Load more comments" because that causes infinite comment loading.
  const lazyScrollForNextPosts = async () => {
    const before = document.body.scrollHeight;
    window.scrollBy(0, Math.max(cfg.scrollStepPx, window.innerHeight * 0.9));
    await sleep(cfg.scrollPauseMs);
    return document.body.scrollHeight > before;
  };

  const run = async () => {
    if (running) return;
    running = true;
    const me = discoverMe();
    if (!me) console.log('Warning: could not detect your profile from the page; trying anyway.');
    console.log('Delete my comments started. Use liDelCmt.stop() to halt.');

    while (running) {
      const did = await sweep();
      if (!running) break;

      const fetched = await lazyScrollForNextPosts();
      if (did === 0 && !fetched && getYourCommentArticles().length === 0) break;

      await sleep(cfg.sweepPauseMs);
    }
    running = false;
    console.log(`Finished. Deleted ${totalDeleted} comments.`);
  };

  // Controls
  window.liDelCmt = {
    start: () => run(),
    stop: () => { running = false; console.log('Stop requested'); },
    status: () => ({
      running,
      totalDeleted,
      meProfilePath,
      onScreen: getYourCommentArticles().length
    })
  };

  run();
})();
