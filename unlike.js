// UNLIKE ANYTHING YOU'VE LIKED. THis script will unlike it all.

(() => {
  const cfg = {
    perClickDelayMs: 1200,      // wait after each unlike click
    sweepPauseMs: 900,          // pause between sweeps
    settleQuietMs: 400,         // idle window for DOM to settle
    scrollStepPx: 800,          // how far to scroll when hunting for more
    scrollPauseMs: 900,         // pause after scroll to let content load
    pagePauseMs: 1500,          // pause after any "Show more" click
    maxErrorsPerButton: 2
  };

  let running = false;
  let totalUnliked = 0;
  let pagesAdvanced = 0;
  let scrollPasses = 0;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const isVisible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  // A like toggle is a role button or a button with aria pressed true
  // We also allow text fallback for UI that shows "Liked"
  const isPressedLikeBtn = el => {
    if (!el || el.disabled) return false;
    const role = el.getAttribute("role");
    const ariaPressed = (el.getAttribute("aria-pressed") || "").toLowerCase();
    const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
    const txt = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();

    // must be visible
    if (!isVisible(el)) return false;

    // positive signals of being in liked state
    const pressed = ariaPressed === "true";
    const labelSaysUnlike = /\b(unlike|remove like|remove reaction)\b/.test(ariaLabel);
    const textSaysLiked = /\bliked\b/.test(txt) || /\bremove like\b/.test(txt);

    // ensure it is the like control, not comment or share
    const looksLike = /\blike\b/.test(ariaLabel) || /\blike\b/.test(txt) || /react-button/i.test(el.className);

    return looksLike && (pressed || labelSaysUnlike || textSaysLiked);
  };

  // Limit search to common feed containers, then fall back to document
  const scope = () =>
    document.querySelector('[data-view-name="feed-detail"], main') ||
    document.querySelector('div.feed') ||
    document;

  const getPressedLikeButtons = () => {
    const nodes = scope().querySelectorAll('button, [role="button"]');
    return [...nodes].filter(isPressedLikeBtn);
  };

  const getShowMoreBtns = () => {
    // Some Likes pages still expose a load more button
    const nodes = [...document.querySelectorAll('button, a[role="button"]')];
    return nodes.filter(b => isVisible(b) && /show more/i.test((b.textContent || "").trim()));
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

  const mark = el => { try { el.style.outline = "2px solid red"; el.style.scrollMargin = "120px"; } catch {} };

  const unlikeOne = async btn => {
    let attempts = 0;
    while (attempts <= cfg.maxErrorsPerButton) {
      attempts++;
      if (!btn || !isVisible(btn)) return false;
      btn.scrollIntoView({ block: "center" });
      mark(btn);
      pointerClick(btn);
      await sleep(cfg.perClickDelayMs);

      // Check if it flipped to not pressed
      // Node may be replaced, so requery inside its card
      const card =
        btn.closest('[data-urn]') ||
        btn.closest('article') ||
        btn.closest('li') ||
        btn.parentElement;

      // If the original is no longer pressed, count it and return
      const stillPressed =
        (btn.getAttribute("aria-pressed") || "").toLowerCase() === "true" ||
        /\bliked\b/.test((btn.textContent || "").toLowerCase());

      if (!stillPressed) { totalUnliked++; return true; }

      // If the card has a new like button and it is still pressed, try to find it and retry
      if (card) {
        const candidate = [...card.querySelectorAll('button, [role="button"]')].find(isPressedLikeBtn);
        if (!candidate) { totalUnliked++; return true; }
        btn = candidate;
      } else {
        break;
      }
    }
    return false;
  };

  const sweepScreen = async () => {
    const buttons = getPressedLikeButtons();
    console.log(`Found ${buttons.length} liked toggles on screen`);
    let did = 0;
    for (const b of buttons) {
      if (!running) break;
      if (await unlikeOne(b)) did++;
    }
    return did;
  };

  const settle = (() => {
    let timer = null, resolver = null;
    const obs = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (resolver) { resolver(); resolver = null; } }, cfg.settleQuietMs);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return async () => new Promise(r => {
      resolver = r;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { resolver(); resolver = null; }, cfg.settleQuietMs);
    });
  })();

  const scrollForMore = async () => {
    const before = document.body.scrollHeight;
    window.scrollBy(0, Math.max(cfg.scrollStepPx, window.innerHeight * 0.9));
    await sleep(cfg.scrollPauseMs);
    const after = document.body.scrollHeight;
    scrollPasses++;
    return after > before;
  };

  const clickShowMoreIfAny = async () => {
    const btns = getShowMoreBtns();
    if (!btns.length) return false;
    const b = btns[0];
    b.scrollIntoView({ block: "center" });
    mark(b);
    console.log("Clicking Show more");
    pointerClick(b);
    pagesAdvanced++;
    await sleep(cfg.pagePauseMs);
    return true;
    };

  const nothingLeft = () => getPressedLikeButtons().length === 0;

  const run = async () => {
    if (running) return;
    running = true;
    console.log("Unlike run started. Use liUnlike.stop() to halt.");
    while (running) {
      const did = await sweepScreen();
      if (!running) break;

      // If nothing on screen, try to bring more into view
      if (did === 0) {
        let fetched = await clickShowMoreIfAny();
        if (!fetched) {
          fetched = await scrollForMore();
        }
        await settle();
        if (!fetched && nothingLeft()) break;
        continue;
      }

      // We did work, brief pause and fetch more
      await sleep(cfg.sweepPauseMs);
      await clickShowMoreIfAny();
      await scrollForMore();
      await settle();
    }
    running = false;
    console.log(`Unlike run finished. Unliked ${totalUnliked}. Pages advanced ${pagesAdvanced}. Scroll passes ${scrollPasses}. Remaining liked on screen ${getPressedLikeButtons().length}.`);
  };

  // Controls
  window.liUnlike = {
    start: () => run(),
    stop: () => { running = false; console.log("Stop requested"); },
    status: () => ({
      running,
      totalUnliked,
      pagesAdvanced,
      scrollPasses,
      remainingOnScreen: getPressedLikeButtons().length
    })
  };

  run();
})();
