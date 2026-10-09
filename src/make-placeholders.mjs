#!/usr/bin/env node
// Generates neutral, photo-like placeholder backgrounds so templates render before you add real photography.
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from './core.mjs';

const looks = {
  'moody': 'radial-gradient(60% 40% at 55% 45%,rgba(120,100,80,.55),transparent 70%),linear-gradient(100deg,#0f0d0b 0%,#2a2119 40%,#4a3a2c 55%,#1a1510 100%)',
  'sunlit': 'linear-gradient(115deg,transparent 18%,rgba(255,236,200,.55) 22%,transparent 30%,rgba(255,236,200,.4) 40%,transparent 48%),radial-gradient(80% 60% at 70% 80%,#2c241d,transparent),linear-gradient(160deg,#8a7a68,#3a2f26)',
  'bright': 'radial-gradient(50% 40% at 60% 55%,#d9c9b4,transparent 70%),linear-gradient(180deg,#f3eee7,#dcd2c4)',
  'boucle': 'radial-gradient(70% 50% at 25% 15%,rgba(255,240,215,.7),transparent 70%),linear-gradient(170deg,#cdbfa9,#9c8b75)',
  'casual': 'linear-gradient(90deg,transparent 0 8%,rgba(255,255,255,.07) 8% 9%,transparent 9% 18%),linear-gradient(180deg,#a89d92,#6f625a 60%,#4a2f27 61%,#2a1a16)',
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [name, bg] of Object.entries(looks)) {
  await page.setContent(`<body style="margin:0;width:1080px;height:1920px;background:${bg};position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;filter:contrast(1.1);opacity:.35;background:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='3'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .4  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>&quot;)"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,transparent 50%,rgba(0,0,0,.45))"></div></body>`);
  await page.screenshot({ path: path.join(ROOT, 'assets/photos', `placeholder-${name}.jpg`), type: 'jpeg', quality: 90 });
  console.log('✓ placeholder-' + name);
}
await browser.close();
