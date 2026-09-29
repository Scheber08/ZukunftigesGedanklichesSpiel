// Misst Layout-Shifts (wie Lighthouse mobil) und nennt die verschobenen Elemente.
import { chromium, devices } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:4322/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, timezoneId: 'UTC', locale: 'en-US' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
// langsames 4G wie Lighthouse


await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({
        value: e.value,
        t: Math.round(e.startTime),
        sources: (e.sources || []).map((s) => {
          const n = s.node;
          const desc = n ? (n.nodeType === 1 ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').slice(0, 3).join('.') : '') : '#text:' + (n.textContent || '').slice(0, 30)) : '?';
          return { desc, prev: s.previousRect && [Math.round(s.previousRect.y), Math.round(s.previousRect.height)], cur: s.currentRect && [Math.round(s.currentRect.y), Math.round(s.currentRect.height)] };
        }),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__lcp = { t: Math.round(e.startTime), el: e.element ? e.element.tagName + '.' + e.element.className : '?' };
  }).observe({ type: 'largest-contentful-paint', buffered: true });
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const shifts = await page.evaluate(() => window.__shifts);
const lcp = await page.evaluate(() => window.__lcp);
const total = shifts.reduce((s, x) => s + x.value, 0);
console.log('CLS', total.toFixed(4), 'LCP', JSON.stringify(lcp));
for (const s of shifts) console.log(s.value.toFixed(4), '@', s.t, JSON.stringify(s.sources));
await browser.close();
