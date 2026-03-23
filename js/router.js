/* ═══════════════════════════════════════
   ROUTER
═══════════════════════════════════════ */
const NLM={home:'nl-home',news:'nl-news',games:'nl-games',forum:'nl-forum',comm:'nl-comm',stats:'nl-stats',admin:'nl-admin',quienes:null,copyright:null};
function go(p){
  if(p==='admin' && !isAdmin()){ toast('Acceso denegado.','err'); return; }
  document.querySelectorAll('.pg').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('nav ul a').forEach(x=>x.classList.remove('on'));
  const pg=document.getElementById('pg-'+p); if(!pg) return;
  pg.classList.add('on');
  const nl=document.getElementById(NLM[p]); if(nl) nl.classList.add('on');
  curPage=p;
  window.scrollTo({top:0,behavior:'smooth'});
  switchGlow(p);
  updateMobNav(p);
  renderPage(p); scheduleReveal();
}
function renderPage(p){
  if(p==='home')  { renderSBNews(); renderFeatGame(); renderHomeForum(); loadGameStats(CFG.GAME_PLACE_ID); }
  if(p==='news')  { renderAllNews(); }
  if(p==='games') { renderGames(); }
  if(p==='forum') { renderForum(); }
  if(p==='comm')  { renderTeam(); }
  if(p==='stats') { loadPublicStats(); }
  if(p==='admin') { renderAdminNews(); }
}

/* ═══════════════════════════════════════
   NAV
═══════════════════════════════════════ */
function renderNav(){
  const el=document.getElementById('nav-r');
  const mob=document.getElementById('mob-auth-bar');
  const adminLi=document.getElementById('nl-admin-li');
  if(adminLi) adminLi.style.display = isAdmin() ? '' : 'none';
  const btnRefresh=document.getElementById('btn-refresh-stats');
  if(btnRefresh) btnRefresh.style.display=isAdmin()?'':'none';
  if(SES){
    const av=SES.avatarUrl?`<img src="${SES.avatarUrl}" alt="${SES.username}"/>`
      :SES.username[0].toUpperCase();
    el.innerHTML=`<div class="upill"><div class="uav">${av}</div><span>${SES.username}</span>${isOwner()?'<span style="font-size:10px;color:var(--ok);margin-left:4px">Owner</span>':isAdmin()?'<span style="font-size:10px;color:var(--w4);margin-left:3px">Admin</span>':''}</div><button class="btn btn-o btn-sm" onclick="doLogout()">Salir</button>`;
    if(mob) mob.innerHTML=`<div class="upill"><div class="uav">${av}</div><span>${SES.username}</span></div><button class="btn btn-o btn-sm" onclick="doLogout()">Salir</button>`;
  } else {
    el.innerHTML=`<button class="btn btn-o btn-sm" onclick="openAuth('in')">Iniciar sesión</button><button class="btn btn-w btn-sm" onclick="openAuth('up')">Registrarse</button>`;
    if(mob) mob.innerHTML=`<button class="btn btn-o btn-sm" onclick="openAuth('in')">Iniciar sesión</button><button class="btn btn-w btn-sm" onclick="openAuth('up')">Registrarse</button>`;
  }
}
function showAdminBar(id){ const b=document.getElementById(id); if(b) b.classList.toggle('on',isAdmin()); }

/* ═══════════════════════════════════════
   MOBILE NAV
═══════════════════════════════════════ */
function toggleMobNav(){
  const nav = document.getElementById('mob-nav');
  const btn = document.getElementById('mob-menu-btn');
  const isOpen = nav.classList.toggle('on');
  btn.classList.toggle('on', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
}
function closeMobNav(){
  const nav = document.getElementById('mob-nav');
  const btn = document.getElementById('mob-menu-btn');
  nav.classList.remove('on');
  btn.classList.remove('on');
  document.body.style.overflow = '';
}
function updateMobNav(page){
  document.querySelectorAll('.mob-nav a').forEach(a=>a.classList.remove('on'));
  const el = document.getElementById('mn-'+page);
  if(el) el.classList.add('on');
  const adminEl = document.getElementById('mn-admin');
  if(adminEl) adminEl.style.display = isAdmin() ? '' : 'none';
}

/* ═══════════════════════════════════════
   SCROLL REVEAL
═══════════════════════════════════════ */
function scheduleReveal(){
  requestAnimationFrame(()=>{
    const obs=new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('v');obs.unobserve(e.target);}});
    },{threshold:.05});
    document.querySelectorAll('.ri:not(.v)').forEach(el=>{
      if(el.getBoundingClientRect().top<window.innerHeight-20) el.classList.add('v');
      else obs.observe(el);
    });
  });
}
window.addEventListener('scroll',scheduleReveal,{passive:true});

/* ═══════════════════════════════════════
   MODAL LISTENERS
═══════════════════════════════════════ */
document.getElementById('auth-ov').addEventListener('click',e=>{if(e.target.id==='auth-ov')closeAuth();});
document.getElementById('nm-ov').addEventListener('click',e=>{if(e.target.id==='nm-ov')closeNM();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeAuth();closeNM();closeMobNav();}});

/* ═══════════════════════════════════════
   THEME
═══════════════════════════════════════ */
function initTheme(){
  const saved = localStorage.getItem('ash_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme, false);
}
function applyTheme(theme, animate=true){
  const btn = document.getElementById('theme-btn');
  if(animate && btn){ btn.classList.add('spinning'); setTimeout(()=>btn.classList.remove('spinning'),400); }
  if(theme==='light'){
    document.documentElement.classList.add('light');
    if(btn) btn.textContent='☀️';
  } else {
    document.documentElement.classList.remove('light');
    if(btn) btn.textContent='🌙';
  }
  localStorage.setItem('ash_theme', theme);
}
function toggleTheme(){
  const isLight = document.documentElement.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e=>{
  if(!localStorage.getItem('ash_theme')) applyTheme(e.matches ? 'dark' : 'light');
});

/* ═══════════════════════════════════════
   AMBIENT GLOW — dynamic canvas system
═══════════════════════════════════════ */
const GLOW_PALETTES = {
  home:   [[61,158,110],[74,126,181],[45,180,120],[90,160,100]],
  news:   [[74,126,181],[61,158,110],[50,100,200],[80,140,220]],
  games:  [[122,90,170],[192,80,74],[150,60,200],[180,80,140]],
  forum:  [[168,128,58],[122,90,170],[200,150,40],[140,100,60]],
  comm:   [[192,80,74],[168,128,58],[200,60,80],[180,100,40]],
  admin:  [[61,158,110],[74,126,181],[40,140,100],[60,120,80]],
  quienes:[[61,158,110],[74,126,181],[45,120,90],[60,100,80]],
  copyright:[[74,126,181],[122,90,170],[50,100,160],[80,80,140]],
};

const ORB_COUNT = 5;
let orbs = [];
let currentPalette = GLOW_PALETTES.home;
let targetPalette  = GLOW_PALETTES.home;
let paletteBlend   = 1;
let glowCanvas, glowCtx;
let glowRAF;

function rand(a,b){ return a + Math.random()*(b-a); }
function randInt(a,b){ return Math.floor(rand(a,b)); }

function makeOrb(palette, idx){
  const rgb = palette[idx % palette.length];
  return {
    x: rand(0.05, 0.95),
    y: rand(0.05, 0.95),
    r: rand(260, 520),
    rgb: [...rgb],
    alpha: rand(0.35, 0.65),
    alphaTarget: rand(0.3, 0.7),
    alphaSpeed: rand(0.0008, 0.002),
    vx: rand(-0.000015, 0.000015),
    vy: rand(-0.000012, 0.000012),
    driftAmp: rand(0.008, 0.025),
    driftFreq: rand(0.00003, 0.00008),
    driftPhaseX: rand(0, Math.PI*2),
    driftPhaseY: rand(0, Math.PI*2),
    rgbTarget: null,
    rgbSpeed: rand(0.001, 0.003),
    colorTimer: rand(10000, 25000),
    colorTimerStart: performance.now(),
  };
}

function initGlowCanvas(){
  glowCanvas = document.getElementById('glow-canvas');
  if(!glowCanvas) return;
  glowCtx = glowCanvas.getContext('2d');
  resizeGlowCanvas();
  window.addEventListener('resize', resizeGlowCanvas);
  orbs = Array.from({length: ORB_COUNT}, (_,i) => makeOrb(currentPalette, i));
  scheduleRandomMutations();
  glowRAF = requestAnimationFrame(glowTick);
}

function resizeGlowCanvas(){
  if(!glowCanvas) return;
  glowCanvas.width  = window.innerWidth;
  glowCanvas.height = window.innerHeight;
}

let lastTime = 0;
function glowTick(now){
  const dt = Math.min(now - lastTime, 16);
  lastTime = now;
  if(!glowCtx || !glowCanvas){ glowRAF=requestAnimationFrame(glowTick); return; }
  const W = glowCanvas.width, H = glowCanvas.height;
  const isLight = document.documentElement.classList.contains('light');
  const baseAlphaMul = isLight ? 0.75 : 1.0;
  glowCtx.clearRect(0,0,W,H);
  orbs.forEach((o,i) => {
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    const t = now;
    const dx = o.driftAmp * Math.sin(t * o.driftFreq + o.driftPhaseX) * 0.001;
    const dy = o.driftAmp * Math.cos(t * o.driftFreq + o.driftPhaseY) * 0.001;
    if(o.x < -0.1) o.x = 1.1;
    if(o.x > 1.1)  o.x = -0.1;
    if(o.y < -0.1) o.y = 1.1;
    if(o.y > 1.1)  o.y = -0.1;
    const alphaDiff = o.alphaTarget - o.alpha;
    o.alpha += alphaDiff * o.alphaSpeed * dt;
    if(Math.abs(alphaDiff) < 0.01){
      o.alphaTarget = rand(0.28, 0.65);
      o.alphaSpeed  = rand(0.0008, 0.002);
    }
    if(o.rgbTarget){
      let done = true;
      for(let c=0;c<3;c++){
        const diff = o.rgbTarget[c] - o.rgb[c];
        o.rgb[c] += diff * o.rgbSpeed * dt * 0.02;
        if(Math.abs(diff)>1) done=false;
      }
      if(done) o.rgbTarget=null;
    }
    if(now - o.colorTimerStart > o.colorTimer){
      const palette = targetPalette;
      o.rgbTarget = [...palette[randInt(0,palette.length)]];
      o.rgbTarget = o.rgbTarget.map(c=>Math.min(255,Math.max(0, c + randInt(-30,30))));
      o.colorTimerStart = now;
      o.colorTimer = rand(10000, 28000);
    }
    const cx = (o.x + dx) * W;
    const cy = (o.y + dy) * H;
    const r  = o.r;
    const alpha = Math.max(0, Math.min(1, o.alpha)) * baseAlphaMul;
    const grad = glowCtx.createRadialGradient(cx,cy,0,cx,cy,r);
    const [rc,gc,bc] = o.rgb.map(Math.round);
    grad.addColorStop(0,   `rgba(${rc},${gc},${bc},${alpha})`);
    grad.addColorStop(0.4, `rgba(${rc},${gc},${bc},${alpha*0.5})`);
    grad.addColorStop(1,   `rgba(${rc},${gc},${bc},0)`);
    glowCtx.beginPath();
    glowCtx.arc(cx,cy,r,0,Math.PI*2);
    glowCtx.fillStyle = grad;
    glowCtx.fill();
  });
  glowRAF = requestAnimationFrame(glowTick);
}

function scheduleRandomMutations(){
  const mutate = () => {
    const count = randInt(1,3);
    for(let i=0;i<count;i++){
      const orb = orbs[randInt(0,orbs.length)];
      if(!orb) continue;
      const palette = targetPalette;
      orb.rgbTarget = palette[randInt(0,palette.length)].map(c=>
        Math.min(255,Math.max(0, c + randInt(-40,40)))
      );
      orb.colorTimerStart = performance.now();
    }
    setTimeout(mutate, rand(8000, 18000));
  };
  setTimeout(mutate, rand(5000, 10000));
}

function switchGlow(page){
  const palette = GLOW_PALETTES[page] || GLOW_PALETTES.home;
  targetPalette = palette;
  orbs.forEach((o,i) => {
    const base = palette[i % palette.length];
    o.rgbTarget = base.map(c => Math.min(255,Math.max(0, c+randInt(-25,25))));
    o.colorTimerStart = performance.now();
    o.colorTimer = rand(3000, 7000);
  });
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
async function init(){
  initTheme();
  initGlowCanvas();

  // Crear owner si no existe
  try{
    const {data:adminExists} = await sb.from('users').select('id').eq('username',CFG.ADMIN_USER).maybeSingle();
    if(!adminExists){
      await sb.from('users').insert({username:CFG.ADMIN_USER,password:CFG.ADMIN_PASS,is_admin:true,contact:CFG.OWNER_EMAIL,contact_type:'email'});
    }
  } catch(e){ console.warn('[init] No se pudo verificar el owner:', e); }

  // Sincronizar sesión guardada con el estado real en DB
  // BUG CORREGIDO: .single() reemplazado por .maybeSingle() + manejo de error explícito.
  // Antes: si la query fallaba (red, RLS) fresh era undefined y el spread {...SES, ...undefined}
  // guardaba una sesión corrupta o directamente borraba el rol del usuario.
  if(SES){
    try{
      const {data:fresh, error:freshErr} = await sb.from('users')
        .select('is_admin,avatar_url')
        .eq('username', SES.username)
        .maybeSingle();

      if(freshErr) throw freshErr;

      if(fresh){
        // Usuario existe en DB → actualizar rol y avatar
        saveSes({
          ...SES,
          isAdmin:   !!fresh.is_admin,
          isOwner:   (SES.username||'').toLowerCase() === CFG.ADMIN_USER.toLowerCase(),
          avatarUrl: fresh.avatar_url || SES.avatarUrl || null
        });
      } else {
        // Usuario ya no existe en DB (fue eliminado) → cerrar sesión limpiamente
        saveSes(null);
        toast('Tu sesión expiró. Iniciá sesión nuevamente.', 'err');
      }
    } catch(e){
      // Error de red o RLS → NO tocar la sesión, continuar con la cacheada
      console.warn('[init] No se pudo sincronizar la sesión, usando cache:', e);
    }
  }

  renderNav();
  go('home');
}
init();