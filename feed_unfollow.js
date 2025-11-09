// THis one unfollows pages and people from your feed directly. Useful to catch stragglers you are following that don't show up in Network. 

(() => {
  const cfg = {
    perClickDelayMs: 2200,      // wait after clicking Unfollow
    menuOpenDelayMs: 800,       // wait after opening meatball menu
    modalWaitMs: 600,           // wait for possible confirm dialogs
    scrollDelayMs: 1200,        // wait after scrolling
    sweepPauseMs: 900,          // small pause between sweeps
    maxPerRun: 800,             // safety cap per session
    debug: true
  };

  let running = false;
  let total = 0, postsSeen = 0, menusOpened = 0, cycles = 0;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const isVisible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  const log = (...args) => { if (cfg.debug) console.log("[liFeedUnfollow]", ...args); };

  const mark = el => { try { el.style.outline = "2px solid red"; el.style.scrollMargin = "120px"; } catch {} };

  // Heuristics to find feed posts and their menus
  const getFeedPosts = () => {
    // Prefer <article> with a LinkedIn activity URN, else fall back to common containers
    const nodes = document.querySelectorAll([
      'article[data-urn*="urn:li:activity"]',
      'article[data-urn*="urn:li:ugcPost"]',
      'div.feed-shared-update-v2',
      'div.feed-shared-update-v3',
      'div.update-components-card',
    ].join(", "));
    return [...nodes].filter(isVisible);
  };

  const getMenuButton = root => {
    if (!root) return null;
    // Common triggers for the meatball menu on feed posts
    const candidates = root.querySelectorAll([
      'button[aria-label*="More"]',
      'button[aria-label*="more"]',
      'button.feed-shared-control-menu__trigger',
      'button.update-components-header__control-menu',
      'button.artdeco-dropdown__trigger',
      'div[role="button"][aria-label*="More"]',
    ].join(", "));
    // choose a visible one closest to the header area
    return [...candidates].find(isVisible) || null;
  };

  const pointerClick = el => {
    const opts = { bubbles: true, cancelable: true, view: window };
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    } catch {
      el.click();
    }
  };

  const findOpenMenu = () => {
    // Active artdeco dropdown menu
    const menus = document.querySelectorAll('div[role="menu"], ul[role="menu"]');
    return [...menus].find(m => isVisible(m));
  };

  const findUnfollowItem = menuRoot => {
    if (!menuRoot) return null;
    const items = menuRoot.querySelectorAll('[role="menuitem"], li, button, a, div[role="button"]');
    const match = [...items].find(el => {
      if (!isVisible(el)) return false;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      // Match Unfollow for people or pages, sometimes includes the name
      return /^unfollow\b/.test(t);
    });
    return match || null;
  };

  const confirmModalIfAny = async () => {
    await sleep(cfg.modalWaitMs);
    // Some flows show a confirm dialog with an Unfollow or Confirm button
    const confirm = [...document.querySelectorAll('button, a[role="button"], div[role="button"]')]
      .find(el => isVisible(el) && /^(unfollow|confirm)$/i.test((el.textContent || "").trim()));
    if (confirm) {
      log("Confirming Unfollow in modal");
      pointerClick(confirm);
      await sleep(cfg.perClickDelayMs);
      return true;
    }
    return false;
  };

  const closeMenuIfOpen = () => {
    const menu = findOpenMenu();
    if (menu) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
  };

  const scrollIntoViewCenter = el => {
    try { el.scrollIntoView({ block: "center", behavior: "instant" }); } catch { el.scrollIntoView({ block: "center" }); }
  };

  const processPost = async post => {
    postsSeen++;
    const menuBtn = getMenuButton(post);
    if (!menuBtn) return false;

    scrollIntoViewCenter(post);
    mark(post);
    pointerClick(menuBtn);
    menusOpened++;
    await sleep(cfg.menuOpenDelayMs);

    // If menu did not appear, try a second time
    let menu = findOpenMenu();
    if (!menu) {
      pointerClick(menuBtn);
      await sleep(cfg.menuOpenDelayMs);
      menu = findOpenMenu();
    }
    if (!menu) return false;

    const unfollowItem = findUnfollowItem(menu);
    if (!unfollowItem) {
      closeMenuIfOpen();
      return false;
    }

    log("Clicking Unfollow:", (unfollowItem.textContent || "").trim());
    pointerClick(unfollowItem);
    await confirmModalIfAny();
    await sleep(cfg.perClickDelayMs);

    closeMenuIfOpen();
    total++;
    return true;
  };

  const sweepViewport = async () => {
    const posts = getFeedPosts();
    log(`Posts on screen: ${posts.length}`);
    let did = 0;
    for (const p of posts) {
      if (!running) break;
      try {
        const ok = await processPost(p);
        if (ok) did++;
        if (total >= cfg.maxPerRun) {
          log("Hit safety cap. Stopping.");
          running = false;
          break;
        }
      } catch (e) {
        log("Error processing post:", e);
        closeMenuIfOpen();
      }
    }
    return did;
  };

  const advanceFeed = async () => {
    // Scroll a few viewports to fetch new posts
    const steps = 3;
    for (let i = 0; i < steps && running; i++) {
      window.scrollBy({ top: Math.max(600, window.innerHeight * 0.9), left: 0, behavior: "instant" });
      await sleep(cfg.scrollDelayMs);
    }
    return true;
  };

  const run = async () => {
    if (running) return;
    running = true;
    log("Feed Unfollow started. Use liFeedUnfollow.stop() to halt.");
    while (running) {
      cycles++;
      const did = await sweepViewport();
      if (!running) break;

      // If nothing was done, still advance to load new items
      await advanceFeed();
      await sleep(cfg.sweepPauseMs);

      // Basic idle detection, if no new menus were opened for a while, stop
      if (did === 0 && getFeedPosts().length === 0) {
        log("No posts found, stopping.");
        break;
      }
    }
    running = false;
    log(`Done. Unfollowed ${total}. Posts seen ${postsSeen}. Menus opened ${menusOpened}. Cycles ${cycles}.`);
  };

  window.liFeedUnfollow = {
    start: () => run(),
    stop: () => { running = false; log("Stop requested"); },
    status: () => ({ running, total, postsSeen, menusOpened, cycles })
  };

  run();
})();
