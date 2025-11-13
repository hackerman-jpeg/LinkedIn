// LinkedIn Feed Unfollow Sweeper — unfollow only, never remove connection
(() => {
  const cfg = {
    perClickDelayMs: 2000,
    menuOpenDelayMs: 600,
    modalWaitMs: 900,
    scrollDelayMs: 900,
    sweepPauseMs: 600,
    maxPerRun: 800,
    toastWaitMs: 5000,
    menuSearchTimeoutMs: 2500,
    debug: true,
    toastOkSubstrings: [
      "you will no longer see",
      "you are no longer following",
      "unfollowed",
      "stopped following"
    ]
  };

  let running = false;
  let total = 0, postsSeen = 0, menusOpened = 0, cycles = 0, misses = 0;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => cfg.debug && console.log("[liFeedUnfollow]", ...a);

  const isVisible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };

  const click = el => {
    if (!el) return;
    try {
      const opts = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
    } catch {}
    try { el.click(); } catch {}
    try { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } catch {}
  };

  const esc = () => { try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch {} };

  const scrollIntoViewCenter = el => {
    try { el.scrollIntoView({ block: "center", behavior: "instant" }); }
    catch { try { el.scrollIntoView({ block: "center" }); } catch {} }
  };

  const getFeedPosts = () => {
    const nodes = document.querySelectorAll([
      'article[role="article"][data-urn*="urn:li:activity"]',
      'article[role="article"][data-urn*="urn:li:ugcPost"]',
      'div[data-view-name="feed-full-update"]',
      'div.feed-shared-update-v2',
      'div.feed-shared-update-v3',
      'div.update-components-card'
    ].join(", "));
    return [...nodes].filter(isVisible);
  };

  const getMenuButton = root => {
    if (!root) return null;
    const cands = root.querySelectorAll([
      'button.feed-shared-control-menu__trigger',
      'button.update-components-header__control-menu',
      'button.artdeco-dropdown__trigger[aria-haspopup="true"]',
      'button[aria-label*="More actions"]',
      'button[aria-label*="More"]',
      'div[role="button"][aria-label*="More"]'
    ].join(", "));
    return [...cands].find(isVisible) || null;
  };

  const waitForNode = (root, predicate, timeoutMs) => new Promise(resolve => {
    const t0 = performance.now();
    const check = () => {
      const found = predicate();
      if (found) { resolve(found); return; }
      if (performance.now() - t0 >= timeoutMs) { resolve(null); return; }
      requestAnimationFrame(check);
    };
    const mo = new MutationObserver(() => {
      const found = predicate();
      if (found) { try { mo.disconnect(); } catch {} resolve(found); }
    });
    try { mo.observe(root || document.body, { childList: true, subtree: true, attributes: true }); } catch {}
    check();
    setTimeout(() => { try { mo.disconnect(); } catch {} }, timeoutMs + 50);
  });

  const findMenuForTrigger = async trigger => {
    if (!trigger) return null;

    const id = trigger.getAttribute("aria-controls");
    if (id) {
      const menu = await waitForNode(document, () => {
        const m = document.getElementById(id);
        return m && isVisible(m) ? m : null;
      }, cfg.menuSearchTimeoutMs);
      if (menu) return menu;
    }

    const container = trigger.closest(".artdeco-dropdown, .ember-view, [data-test-dropdown]");
    if (container) {
      const menu = await waitForNode(container, () => {
        const m = container.querySelector('div[role="menu"], ul[role="menu"], .artdeco-dropdown__content, .artdeco-dropdown__content-inner');
        return m && isVisible(m) ? m : null;
      }, cfg.menuSearchTimeoutMs);
      if (menu) return menu;
    }

    const tRect = trigger.getBoundingClientRect();
    const near = () => {
      const menus = [...document.querySelectorAll('div[role="menu"], ul[role="menu"], .artdeco-dropdown__content, .artdeco-dropdown__content-inner')]
        .filter(isVisible)
        .sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          const da = Math.hypot(ra.left - tRect.left, ra.top - tRect.top);
          const db = Math.hypot(rb.left - tRect.left, rb.top - tRect.top);
          return da - db;
        });
      return menus[0] || null;
    };
    return await waitForNode(document, near, cfg.menuSearchTimeoutMs);
  };

  // Text guards
  const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const isUnfollowText = s => {
    const t = norm(s);
    return t.startsWith("unfollow")
        || t.includes("stop following")
        || t.includes("unfollow page")
        || t.includes("unfollow company")
        || t.includes("unfollow person")
        || t === "unfollow";
  };
  const isDangerousText = s => {
    const t = norm(s);
    return t.includes("remove connection")
        || (t.includes("remove") && t.includes("connection"))
        || t.includes("disconnect")
        || t.includes("block")
        || t.includes("report");
  };
  const isCancelText = s => {
    const t = norm(s);
    return t === "cancel" || t === "close" || t === "no" || t.includes("keep");
  };

  // Menu item finder with a hard blocklist
  const findUnfollowInMenu = menu => {
    if (!menu) return null;

    const primary = [...menu.querySelectorAll([
      'button[role="menuitem"]',
      'a[role="menuitem"]',
      'div[role="menuitem"]',
      'li[role="menuitem"] > button',
      'li[role="menuitem"] > a',
      // legacy LinkedIn menu item classes when present
      'div[role="button"].feed-shared-control-menu__dropdown-item',
      'button.feed-shared-control-menu__dropdown-item',
      'a.feed-shared-control-menu__dropdown-item'
    ].join(", "))]
      .filter(isVisible)
      .filter(el => !isDangerousText(el.textContent))
      .find(el => isUnfollowText(el.textContent));
    if (primary) return primary;

    const any = [...menu.querySelectorAll('*')]
      .filter(isVisible)
      .filter(el => !isDangerousText(el.textContent))
      .find(el => isUnfollowText(el.textContent));
    if (any) {
      const clickable = any.closest('[role="button"], button, a, li[role="menuitem"]') || any;
      if (clickable && isVisible(clickable)) return clickable;
    }
    return null;
  };

  const waitForToastOk = async () => {
    const ok = await waitForNode(document.body, () => {
      const cands = [
        ...document.querySelectorAll('.artdeco-toast-item, .artdeco-toast, .feedback-contextual__container, [role="alert"], [aria-live="polite"], [aria-live="assertive"]')
      ].filter(isVisible);
      const toast = cands[0];
      if (!toast) return null;
      const msg = norm(toast.textContent);
      return cfg.toastOkSubstrings.some(s => msg.includes(s)) ? toast : null;
    }, cfg.toastWaitMs);
    return !!ok;
  };

  const closeMenuIfOpenNear = trigger => {
    esc();
    const dd = trigger && trigger.closest(".artdeco-dropdown");
    const btn = dd && dd.querySelector('.artdeco-dropdown__trigger[aria-expanded="true"]');
    if (btn) { try { btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch {} }
  };

  // Confirm logic that will never confirm a Remove connection dialog
  const confirmIfPrompted = async () => {
    await sleep(cfg.modalWaitMs);

    // find any visible dialog or sheet
    const modal = [...document.querySelectorAll('.artdeco-modal, .artdeco-toast-item, [role="dialog"], [role="alertdialog"]')].find(isVisible);
    const scope = modal || document;

    const text = norm(scope.textContent);
    const hasDanger = isDangerousText(text);
    const hasUnfollow = isUnfollowText(text);

    if (hasDanger && !hasUnfollow) {
      // actively cancel
      const cancelBtn = [...scope.querySelectorAll('button, a[role="button"], div[role="button"]')]
        .filter(isVisible)
        .find(b => isCancelText(b.textContent)) || null;
      if (cancelBtn) {
        log("Danger dialog detected, canceling:", norm(cancelBtn.textContent));
        click(cancelBtn);
        await sleep(300);
      } else {
        // if no explicit cancel, press Escape
        log("Danger dialog detected, closing via Escape");
        esc();
      }
      return false;
    }

    if (hasUnfollow) {
      const confirmBtn = [...scope.querySelectorAll('button, a[role="button"], div[role="button"]')]
        .filter(isVisible)
        .find(b => isUnfollowText(b.textContent) || norm(b.textContent) === "confirm" || norm(b.textContent) === "yes");
      if (confirmBtn) {
        log("Unfollow confirm dialog, confirming");
        click(confirmBtn);
        await sleep(cfg.perClickDelayMs);
        return true;
      }
    }

    return false;
  };

  // Author header Following toggle path
  const tryHeaderFollowToggle = async post => {
    const btn = post.querySelector('button[aria-pressed="true"][data-control-name*="follow"], button[aria-label*="Following"]');
    if (!btn || !isVisible(btn)) return false;
    scrollIntoViewCenter(btn);
    click(btn);

    // If a small menu opens, select unfollow, never remove connection
    const mini = await findMenuForTrigger(btn);
    if (mini) {
      const item = findUnfollowInMenu(mini);
      if (item) {
        scrollIntoViewCenter(item);
        click(item);
        await sleep(cfg.perClickDelayMs);
        if (await waitForToastOk()) return true;
      } else {
        // if the mini menu only has remove connection, bail out
        log("Mini menu has no unfollow, skipping to stay connected");
        esc();
      }
    }
    // Or it toggles directly, check toast
    return await waitForToastOk();
  };

  const processPost = async post => {
    postsSeen++;
    const menuBtn = getMenuButton(post);
    if (!menuBtn) return false;

    scrollIntoViewCenter(post);
    try { post.style.outline = "2px solid red"; post.style.scrollMargin = "120px"; } catch {}
    click(menuBtn);
    menusOpened++;

    await sleep(cfg.menuOpenDelayMs);
    const menu = await findMenuForTrigger(menuBtn);
    if (!menu) { log("Menu not found for trigger"); return false; }

    const unfollowBtn = findUnfollowInMenu(menu);
    if (!unfollowBtn) {
      log("Unfollow not in this menu, trying header toggle");
      closeMenuIfOpenNear(menuBtn);
      const alt = await tryHeaderFollowToggle(post);
      if (alt) { total++; return true; }
      misses++; return false;
    }

    const label = (unfollowBtn.textContent || "").replace(/\s+/g, " ").trim();
    log("Clicking:", label);
    scrollIntoViewCenter(unfollowBtn);
    click(unfollowBtn);

    // Only confirm if the dialog is clearly about unfollow. Cancel any remove connection dialog.
    await confirmIfPrompted();

    const ok = await waitForToastOk();
    closeMenuIfOpenNear(menuBtn);

    if (ok) { total++; return true; }
    log("No success toast, counting as miss");
    misses++; return false;
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
        esc();
      }
    }
    return did;
  };

  const advanceFeed = async () => {
    for (let i = 0; i < 3 && running; i++) {
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
      await advanceFeed();
      await sleep(cfg.sweepPauseMs);
      if (did === 0 && getFeedPosts().length === 0) {
        log("No posts found, stopping.");
        break;
      }
    }
    running = false;
    log(`Done. Unfollowed ${total}. Posts seen ${postsSeen}. Menus opened ${menusOpened}. Misses ${misses}. Cycles ${cycles}.`);
  };

  window.liFeedUnfollow = {
    start: () => run(),
    stop: () => { running = false; log("Stop requested"); },
    status: () => ({ running, total, postsSeen, menusOpened, misses, cycles })
  };

  run();
})();
