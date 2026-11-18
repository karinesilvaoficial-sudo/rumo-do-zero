const { chromium } = require('playwright');
const fs = require('fs');
const R = '/home/user/rumo-do-zero/apps/web';
const font = (w) => fs.readFileSync(`${R}/app/fonts/manrope-latin-${w}-normal.woff2`).toString('base64');
const logoW = fs.readFileSync(`${R}/public/rumo-logo-white.svg`, 'utf8');
const sym = `<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M32 4 L52 58 L32 46 Z" fill="#ffffff" opacity=".92"/><path d="M32 4 L12 58 L32 46 Z" fill="#1F57FF"/></svg>`;
const css = `@font-face{font-family:M;src:url(data:font/woff2;base64,${font(400)})format('woff2');font-weight:400}
@font-face{font-family:M;src:url(data:font/woff2;base64,${font(600)})format('woff2');font-weight:600}
@font-face{font-family:M;src:url(data:font/woff2;base64,${font(700)})format('woff2');font-weight:700}
*{margin:0;box-sizing:border-box}body{font-family:M,sans-serif;-webkit-font-smoothing:antialiased}`;
const check = `<svg width="30" height="30" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.14)"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const plans = [
  { f: 'pro', name: 'Pro', tag: 'Para organizar sua vida financeira', price: '19,90', g: ['#1F57FF', '#0B1F4D'], items: ['2 espaços (pessoal e negócio)', '2.000 lançamentos por mês', '50 créditos de IA por mês', 'Até 2 convidados'] },
  { f: 'max', name: 'Max', tag: 'Para quem já tem negócio rodando', price: '49,90', g: ['#3B6BFF', '#0A1640'], badge: 'Mais escolhido', items: ['5 espaços', '20.000 lançamentos por mês', '150 créditos de IA por mês', 'Até 10 convidados'] },
  { f: 'ilimitado', name: 'Ilimitado', tag: 'Sem teto para crescer', price: '149,90', g: ['#0B1F4D', '#05102B'], gold: true, items: ['Espaços ilimitados', 'Lançamentos ilimitados', '500 créditos de IA por mês', 'Até 25 convidados'] },
];
const offer = (p) => `<html><head><style>${css}
.c{width:1000px;height:1000px;padding:72px;color:#fff;position:relative;overflow:hidden;background:radial-gradient(120% 90% at 85% 0%,${p.g[0]} 0%,${p.g[1]} 70%)}
.glow{position:absolute;right:-180px;bottom:-220px;width:620px;height:620px;opacity:.10}
.top{display:flex;justify-content:space-between;align-items:center}
.logo{height:46px}.logo svg{height:46px;width:auto}
.badge{font-weight:700;font-size:22px;letter-spacing:.04em;text-transform:uppercase;padding:12px 22px;border-radius:999px;background:${p.gold ? 'linear-gradient(90deg,#F5D47A,#C9A043)' : '#fff'};color:${p.gold ? '#2A1E00' : '#1F57FF'}}
h1{white-space:nowrap;font-size:${p.name.length>5?112:150}px;font-weight:700;letter-spacing:-.04em;line-height:1;margin-top:84px}
h1 span{${p.gold ? 'background:linear-gradient(90deg,#F5D47A,#E8B84A);-webkit-background-clip:text;color:transparent' : ''}}
.tag{font-size:36px;font-weight:600;opacity:.85;margin-top:18px}
ul{list-style:none;padding:0;margin-top:44px;display:grid;gap:18px}
li{display:flex;align-items:center;gap:18px;font-size:34px;font-weight:600}
.foot{position:absolute;left:72px;right:72px;bottom:72px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(255,255,255,.18);padding-top:34px}
.per{font-size:28px;opacity:.8;font-weight:600}.pr{font-size:76px;font-weight:700;letter-spacing:-.03em}.pr small{font-size:36px;font-weight:600;opacity:.85;margin-right:8px}
.pix{font-size:26px;font-weight:700;padding:14px 22px;border:2px solid rgba(255,255,255,.5);border-radius:14px}
</style></head><body><div class="c"><div class="glow">${sym}</div>
<div class="top"><div class="logo">${logoW}</div><div class="badge">${p.badge || (p.gold ? 'Premium' : 'Plano mensal')}</div></div>
<h1>RUMO <span>${p.name}</span></h1><div class="tag">${p.tag}</div>
<ul>${p.items.map((i) => `<li>${check}${i}</li>`).join('')}</ul>
<div class="foot"><div><div class="per">Acesso por 1 mês</div><div class="pr"><small>R$</small>${p.price}</div></div><div class="pix">Liberação imediata</div></div>
</div></body></html>`;
const banner = `<html><head><style>${css}
.b{width:1200px;height:360px;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 64px;position:relative;overflow:hidden;background:radial-gradient(90% 140% at 100% 0%,#1F57FF 0%,#0B1F4D 65%)}
.glow{position:absolute;right:-60px;top:-80px;width:520px;height:520px;opacity:.10}
.l svg{height:60px;width:auto}.t{font-size:44px;font-weight:700;letter-spacing:-.02em;margin-top:26px}.s{font-size:24px;opacity:.82;margin-top:10px;font-weight:600}
.pills{display:grid;gap:14px;position:relative}.p{white-space:nowrap;display:flex;gap:12px;align-items:center;font-size:22px;font-weight:600;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);padding:12px 20px;border-radius:12px}
</style></head><body><div class="b"><div class="glow">${sym}</div><div style="position:relative"><div class="l">${logoW}</div><div class="t">Seu dinheiro com direção.</div><div class="s">Finanças, metas e novas rendas num só lugar.</div></div>
<div class="pills"><div class="p">${check}Liberação automática após o pagamento</div><div class="p">${check}Sem renovação automática</div><div class="p">${check}Garantia de 7 dias</div></div></div></body></html>`;
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ deviceScaleFactor: 1 });
  fs.mkdirSync(`${R}/public/cakto`, { recursive: true });
  for (const p of plans) { await pg.setViewportSize({ width: 1000, height: 1000 }); await pg.setContent(offer(p)); await pg.waitForTimeout(150); await pg.screenshot({ path: `${R}/public/cakto/plano-${p.f}.png` }); }
  await pg.setViewportSize({ width: 1200, height: 360 }); await pg.setContent(banner); await pg.waitForTimeout(150); await pg.screenshot({ path: `${R}/public/cakto/checkout-banner.png` });
  await b.close();
})();
