/**
 * Overlay kursora + podświetlenie celu kliknięcia dla nagrań Playwright.
 * Dołącz przez context.addInitScript(cursorInit, theme) — theme z templates/*.json.
 *
 * Lekcja z produkcji: Playwright NIE nagrywa systemowego kursora OS.
 * Niebieska kropka ginie na niebieskim UI. Strzałka zawsze biała.
 * Ramka musi kontrastować z UI (domyślnie bursztyn) — nie maluj jej kolorem brandu,
 * jeśli aplikacja jest w tym samym odcieniu (np. niebieska ramka na niebieskim UI).
 */
export function cursorInit(theme) {
  const t = theme || {};
  const outline = (t.highlight && t.highlight.outline) || '#f59e0b';
  const fill = (t.highlight && t.highlight.fill) || 'rgba(245, 158, 11, .18)';
  const labelBg = (t.label && t.label.background) || '#111827';
  const labelFg = (t.label && t.label.color) || '#fff';
  const STYLE_ID = '__demo-pointer-style';
  const POINTER_ID = '__demo-pointer';
  const SPOT_ID = '__demo-spot';
  const LABEL_ID = '__demo-label';

  const css = `
    #${POINTER_ID}, #${SPOT_ID}, #${LABEL_ID} { pointer-events: none !important; }
    #${POINTER_ID} {
      position: fixed; z-index: 2147483647; left: 40px; top: 40px;
      width: 36px; height: 36px; margin: 0; transform: translate(0, 0);
      will-change: left, top;
      filter: drop-shadow(1px 2px 2px rgba(0,0,0,.45));
    }
    #${POINTER_ID}.__click { transform: translate(1px, 1px) scale(.92); }
    #${SPOT_ID} {
      position: fixed; z-index: 2147483646; left: 0; top: 0; width: 0; height: 0;
      border-radius: 14px; box-sizing: border-box;
      outline: 4px solid ${outline}; outline-offset: 4px;
      background: ${fill};
      box-shadow: 0 0 0 8px ${fill}, 0 10px 28px rgba(0,0,0,.18);
      opacity: 0; transition: opacity .12s ease;
    }
    #${SPOT_ID}.__on { opacity: 1; animation: __demo-pulse 1.1s ease-in-out infinite; }
    #${LABEL_ID} {
      position: fixed; z-index: 2147483647; left: 0; top: 0;
      background: ${labelBg}; color: ${labelFg}; font: 700 15px/1.2 ui-sans-serif, system-ui, sans-serif;
      padding: 8px 12px; border-radius: 999px; white-space: nowrap;
      box-shadow: 0 8px 20px rgba(0,0,0,.28); opacity: 0; transform: translate(-50%, -130%);
    }
    #${LABEL_ID}.__on { opacity: 1; }
    @keyframes __demo-pulse {
      0%, 100% { box-shadow: 0 0 0 6px ${fill}; }
      50% { box-shadow: 0 0 0 12px ${fill}; }
    }
  `;

  function ensure() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
    let pointer = document.getElementById(POINTER_ID);
    if (!pointer) {
      pointer = document.createElement('div');
      pointer.id = POINTER_ID;
      pointer.innerHTML = `<svg viewBox="0 0 28 28" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 3.2 22.6 14.1l-7.2 1.5 3.9 8.4-3.3 1.5-3.9-8.3-6.1 5.3z"
          fill="#fff" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/>
      </svg>`;
      (document.body || document.documentElement).appendChild(pointer);
    }
    let spot = document.getElementById(SPOT_ID);
    if (!spot) {
      spot = document.createElement('div');
      spot.id = SPOT_ID;
      (document.body || document.documentElement).appendChild(spot);
    }
    let label = document.getElementById(LABEL_ID);
    if (!label) {
      label = document.createElement('div');
      label.id = LABEL_ID;
      (document.body || document.documentElement).appendChild(label);
    }
    return { pointer, spot, label };
  }

  let moveToken = 0;
  /**
   * `durationMs` > 0 → interpolacja rAF (to ląduje w recordVideo).
   * Snap na końcu mouse.move nie jest widoczny w webm — stąd animacja w stronie.
   */
  window.__demoMovePointer = (x, y, durationMs = 0) => {
    const { pointer } = ensure();
    const token = ++moveToken;
    const fromX = Number.parseFloat(pointer.style.left) || 0;
    const fromY = Number.parseFloat(pointer.style.top) || 0;
    if (!durationMs || durationMs < 16) {
      pointer.style.left = `${x}px`;
      pointer.style.top = `${y}px`;
      return;
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const ease = (t) => 1 - (1 - t) ** 3;
      const tick = (now) => {
        if (token !== moveToken) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - t0) / durationMs);
        const e = ease(t);
        pointer.style.left = `${fromX + (x - fromX) * e}px`;
        pointer.style.top = `${fromY + (y - fromY) * e}px`;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  };
  window.__demoClickFx = (down) => {
    const { pointer } = ensure();
    pointer.classList.toggle('__click', !!down);
  };
  window.__demoHighlight = (rect, text) => {
    const { spot, label } = ensure();
    const pad = 8;
    spot.style.left = `${rect.x - pad}px`;
    spot.style.top = `${rect.y - pad}px`;
    spot.style.width = `${rect.width + pad * 2}px`;
    spot.style.height = `${rect.height + pad * 2}px`;
    spot.classList.add('__on');
    if (text) {
      label.textContent = text;
      label.style.left = `${rect.x + rect.width / 2}px`;
      label.style.top = `${rect.y - 6}px`;
      label.classList.add('__on');
    } else {
      label.classList.remove('__on');
    }
  };
  window.__demoClearHighlight = () => {
    const { spot, label } = ensure();
    spot.classList.remove('__on');
    label.classList.remove('__on');
  };

  ensure();
  new MutationObserver(() => ensure()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export async function pause(page, ms) {
  await page.waitForTimeout(ms);
}

/**
 * Jedzie strzałką w klatkach (rAF w stronie) i równolegle `mouse.move` pod hover.
 * Czas lotu ~0.5 ms/px, clamp 240–720 ms — krótki skok nie trwa pół sekundy.
 */
export async function pointerTo(page, x, y, steps = 18) {
  const from = await page.evaluate(() => {
    const el = document.getElementById('__demo-pointer');
    if (!el) return { x: 40, y: 40 };
    return {
      x: Number.parseFloat(el.style.left) || 40,
      y: Number.parseFloat(el.style.top) || 40,
    };
  });
  const dist = Math.hypot(x - from.x, y - from.y);
  const duration = Math.round(Math.min(720, Math.max(240, dist * 0.5)));
  await Promise.all([
    page.mouse.move(x, y, { steps }),
    page.evaluate(
      ({ x, y, duration }) => window.__demoMovePointer?.(x, y, duration),
      { x, y, duration },
    ),
  ]);
}

export async function highlight(page, locator, text) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Brak bounding box — element poza ekranem albo niewidoczny');
  await page.evaluate(
    ({ rect, text }) => window.__demoHighlight?.(rect, text),
    {
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      text,
    },
  );
  return box;
}

export async function clearHighlight(page) {
  await page.evaluate(() => window.__demoClearHighlight?.());
}

/**
 * Podświetl cel, dowieź strzałkę, poczekaj, kliknij.
 * `label` jest obowiązkowy — bez etykiety nie widać, gdzie kliknąć.
 */
export async function humanClick(page, locator, label) {
  if (!label) throw new Error('humanClick wymaga etykiety (np. „4. Menu: Użytkownicy”)');
  await locator.scrollIntoViewIfNeeded();
  await pause(page, 200);
  const box = await highlight(page, locator, label);
  const x = box.x + Math.min(box.width * 0.55, Math.max(18, box.width / 2));
  const y = box.y + box.height / 2;
  await pointerTo(page, x, y, 22);
  await pause(page, 800);
  await page.evaluate(() => window.__demoClickFx?.(true));
  await page.mouse.click(x, y, { delay: 80 });
  await page.evaluate(() => window.__demoClickFx?.(false));
  await pause(page, 280);
  await clearHighlight(page);
}

export async function humanType(page, locator, value, delay = 80) {
  await locator.fill('');
  await locator.pressSequentially(value, { delay });
}

export async function hidePointer(page) {
  await page.evaluate(() => {
    const el = document.getElementById('__demo-pointer');
    if (el) el.style.display = 'none';
  });
}

export async function showPointer(page) {
  await page.evaluate(() => {
    const el = document.getElementById('__demo-pointer');
    if (el) el.style.display = '';
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function themeColors(theme) {
  const t = theme || {};
  const g = (t.titleCard && t.titleCard.gradient) || ['#0d2f5c', '#1a5cad', '#3b82c4'];
  return {
    g0: g[0] || '#0d2f5c',
    g1: g[1] || g[0] || '#0d2f5c',
    g2: g[2] || g[1] || g[0] || '#3b82c4',
    color: (t.titleCard && t.titleCard.color) || '#fff',
    font: (t.titleCard && t.titleCard.font) || 'ui-sans-serif, system-ui, sans-serif',
    brand: (t.brand && t.brand.label) || t.name || '',
    mark: (t.brand && t.brand.mark) || ((t.name || '•').slice(0, 1)),
  };
}

export function titleHtml(title, subtitle, kicker = 'Instrukcja', theme) {
  return splashHtml({ title, subtitle, kicker, theme, kind: 'start' });
}

export function splashHtml({ title, subtitle, kicker, theme, kind = 'start' }) {
  const { g0, g1, g2, color, font, brand, mark } = themeColors(theme);
  const isEnd = kind === 'end';
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;font-family:${esc(font)}}
  body{display:flex;align-items:center;justify-content:center;
    background:linear-gradient(145deg,${esc(g0)} 0%,${esc(g1)} 55%,${esc(g2)} 100%);color:${esc(color)}}
  .card{text-align:center;padding:48px 56px;max-width:820px}
  .brand{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:28px}
  .mark{display:flex;width:44px;height:44px;align-items:center;justify-content:center;
    border-radius:12px;background:rgba(255,255,255,.16);font-size:22px;font-weight:800}
  .name{font-size:22px;font-weight:800;letter-spacing:.04em}
  .kicker{letter-spacing:.18em;text-transform:uppercase;font-weight:700;opacity:.75;font-size:14px;margin-bottom:16px}
  h1{font-size:${isEnd ? '52px' : '42px'};line-height:1.15;margin:0 0 16px;font-weight:800}
  p{margin:0 auto;font-size:20px;opacity:.88;max-width:720px}
</style></head>
<body>
  <div class="card">
    ${brand ? `<div class="brand"><span class="mark">${esc(mark)}</span><span class="name">${esc(brand)}</span></div>` : ''}
    <div class="kicker">${esc(kicker)}</div>
    <h1>${esc(title)}</h1>
    <p>${esc(subtitle)}</p>
  </div>
</body></html>`;
}

/** Prawdziwy `goto` (data:), żeby Playwright recordVideo w ogóle złapał kartę. `setContent` wypada z nagrania. */
export async function showHtmlCard(page, html, holdMs) {
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await hidePointer(page);
  await pause(page, holdMs);
}

export async function titleCard(page, title, subtitle, holdMs = 3600, kicker, theme) {
  await showHtmlCard(page, titleHtml(title, subtitle, kicker, theme), holdMs);
}

export async function endCard(page, title, subtitle, holdMs = 3600, kicker, theme) {
  await showHtmlCard(
    page,
    splashHtml({ title, subtitle, kicker, theme, kind: 'end' }),
    holdMs,
  );
}

export function ffmpegToMp4Args(webm, mp4) {
  return [
    '-y',
    '-i',
    webm,
    '-vf',
    'fps=30,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    mp4,
  ];
}
