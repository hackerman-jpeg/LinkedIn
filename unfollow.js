// UNFOLLOW SCRIPT. This script will unfollow everyone you are following. This works for anything in the "Following" tab in Activity Feed on profile. 
// Just cut and paste this into the console in Dev tools in your browser.

(() => {
  const cfg = {
    perClickDelayMs: 1400,
    modalWaitMs: 300,
    pagePauseMs: 1700,
    sweepPauseMs: 800,
    textFollowing: "following",
    textFollow: "follow"
  };

  let running = false;
  let total = 0, pages = 0;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const isVisible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  const isFollowingBtn = btn => {
    if (!btn || btn.disabled) return false;
    const label = (btn.getAttribute("aria-label") || "").toLowerCase();
    if (label.includes("stop following")) return true;
    const txt = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!txt) return false;
    if (txt === cfg.textFollowing) return true;
    if (/\bfollowing\b/.test(txt) && !/\bfollow\b/.test(txt)) return true;
    return false;
  };

  const scope = () => document.querySelector('ul[role="list"]') || document;
  const getFollowingButtons = () => {
    const nodes = scope().querySelectorAll('button.artdeco-button, a[role="button"], div[role="button"]');
    return [...nodes].filter(isVisible).filter(isFollowingBtn);
  };

  const getShowMoreBtn = () => {
    const all = [...document.querySelectorAll('button.scaffold-finite-scroll__load-button, button')];
    return all.find(b => isVisible(b) && /show more results/i.test((b.textContent || "").trim()));
  };

  const pointerClick = el => {
    const opts = {bubbles: true, cancelable: true, view: window};
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

  const confirmModalIfAny = async () => {
    await sleep(cfg.modalWaitMs);
    const confirm = [...document.querySelectorAll('button, a[role="button"], div[role="button"]')]
      .find(el => isVisible(el) && /^(unfollow)$/i.test((el.textContent || "").trim()));
    if (confirm) {
      console.log("Confirming Unfollow in modal");
      pointerClick(confirm);
    }
  };

  const mark = el => { try { el.style.outline = "2px solid red"; el.style.scrollMargin = "120px"; } catch {} };

  const unfollowOne = async btn => {
    if (!btn || !isVisible(btn)) return false;
    btn.scrollIntoView({block: "center"});
    mark(btn);
    console.log("Clicking", btn.getAttribute("aria-label") || (btn.textContent || "").trim());
    pointerClick(btn);
    await confirmModalIfAny();
    await sleep(cfg.perClickDelayMs);

    // Check this card again for the state flip to Follow
    const card = btn.closest("li") || btn.closest('[data-chameleon-result-urn]') || btn.parentElement;
    const stillFollowing = card && [...card.querySelectorAll('button, a[role="button"], div[role="button"]')].some(isFollowingBtn);
    if (!stillFollowing) {
      total++;
      return true;
    }

    // If the same node is still showing Following, check its text
    const txt = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (txt === cfg.textFollow || (/\bfollow\b/.test(txt) && !/\bfollowing\b/.test(txt))) {
      total++;
      return true;
    }
    return false;
  };

  const sweepPage = async () => {
    const buttons = getFollowingButtons();
    console.log(`Found ${buttons.length} Following buttons on screen`);
    let did = 0;
    for (const b of buttons) {
      if (!running) break;
      if (await unfollowOne(b)) did++;
    }
    return did;
  };

  const advancePage = async () => {
    const more = getShowMoreBtn();
    if (!more) return false;
    more.scrollIntoView({block: "center"});
    mark(more);
    console.log("Clicking Show more results");
    pointerClick(more);
    pages++;
    await sleep(cfg.pagePauseMs);
    return true;
  };

  const nothingLeft = () => getFollowingButtons().length === 0 && !getShowMoreBtn();

  const run = async () => {
    if (running) return;
    running = true;
    console.log("LinkedIn Unfollow started. Use liUnfollow.stop() to halt.");
    while (running) {
      const did = await sweepPage();
      if (nothingLeft()) break;
      if (did === 0) {
        const advanced = await advancePage();
        if (!advanced) break;
        await sleep(cfg.sweepPauseMs);
      } else {
        // After work, try to fetch more if available
        if (await advancePage()) {
          await sleep(cfg.sweepPauseMs);
        }
      }
    }
    running = false;
    console.log(`Done. Unfollowed ${total}. Pages advanced ${pages}. Remaining visible Following ${getFollowingButtons().length}.`);
  };

  window.liUnfollow = {
    start: () => run(),
    stop: () => { running = false; console.log("Stop requested"); },
    status: () => ({ running, total, pages, remaining: getFollowingButtons().length })
  };

  run();
})();
