/* ═══════════════════════════════════════
   ROBLOX
═══════════════════════════════════════ */
const PROXY='roproxy.com';
async function rbxFetch(url){
  var urls=[url,'https://corsproxy.io/?'+encodeURIComponent(url)];
  for(var i=0;i<urls.length;i++){
    try{
      var r=await fetch(urls[i]);
      if(r.ok) return r.json();
    }catch(e){}
  }
  return null;
}
async function getUniverseId(placeId){
  if(placeId===CFG.GAME_PLACE_ID) return CFG.GAME_UNIVERSE_ID;
  var d=await rbxFetch('https://apis.roproxy.com/universes/v1/places/'+placeId+'/universe');
  return d&&d.universeId?String(d.universeId):null;
}
async function getGameInfo(universeId){
  var d=await rbxFetch('https://games.roproxy.com/v1/games?universeIds='+universeId);
  return d&&d.data&&d.data[0]?d.data[0]:null;
}
async function getGameVotes(universeId){
  var d=await rbxFetch('https://games.roproxy.com/v1/games/votes?universeIds='+universeId);
  return d&&d.data&&d.data[0]?d.data[0]:null;
}
function fmtNum(n){
  if(n===null||n===undefined) return '—';
  var num=Number(n); if(isNaN(num)) return '—';
  if(num>=1000000000) return (num/1000000000).toFixed(1)+'B';
  if(num>=1000000) return (num/1000000).toFixed(1)+'M';
  if(num>=1000) return (num/1000).toFixed(1)+'K';
  return String(num);
}

/* ═══════════════════════════════════════
   CAROUSEL
═══════════════════════════════════════ */
let carGames=[], carIndex=0, carTimer=null;

async function renderFeatGame(){
  const {data}=await sb.from('games').select('*').order('id');
  GAMES_CACHE=data||[];
  carGames=GAMES_CACHE;
  carIndex=0; clearInterval(carTimer);
  const hgLeft=document.querySelector('.hg-left');
  if(!carGames.length){
    if(hgLeft) hgLeft.style.display='none';
    const prevB=document.getElementById('car-prev'); if(prevB) prevB.style.display='none';
    const nextB=document.getElementById('car-next'); if(nextB) nextB.style.display='none';
    const dotsB=document.getElementById('car-dots'); if(dotsB) dotsB.innerHTML='';
    const artEl=document.getElementById('feat-art'); if(artEl) artEl.querySelectorAll('.feat-art-img').forEach(i=>i.remove());
    const gc2=document.getElementById('st-games-count'); if(gc2) gc2.textContent='00';
    const gp2=document.getElementById('games-count'); if(gp2) gp2.textContent='0 publicados';
    return;
  }
  if(hgLeft) hgLeft.style.display='';
  const artClean=document.getElementById('feat-art'); if(artClean) artClean.querySelectorAll('.feat-art-img').forEach(i=>i.remove());
  const prev=document.getElementById('car-prev');
  const next=document.getElementById('car-next');
  const dotsEl=document.getElementById('car-dots');
  if(carGames.length>1){
    if(prev) prev.style.display='flex';
    if(next) next.style.display='flex';
    if(dotsEl) dotsEl.innerHTML=carGames.map((_,i)=>`<button class="car-dot${i===0?' on':''}" onclick="carGoto(${i})"></button>`).join('');
  }
  const tc=carGames.length;
  const gc=document.getElementById('st-games-count'); if(gc) gc.textContent=String(tc).padStart(2,'0');
  const gp=document.getElementById('games-count'); if(gp) gp.textContent=`${tc} publicado${tc!==1?'s':''}`;
  carGoto(0);
  startCarTimer();
}

function startCarTimer(){
  clearInterval(carTimer);
  if(carGames.length>1) carTimer=setInterval(()=>carMove(1),20000);
}

function carMove(dir){
  carGoto((carIndex+dir+carGames.length)%carGames.length);
  startCarTimer();
}

function carGoto(idx){
  carIndex=idx;
  const game=carGames[idx]; if(!game) return;
  const art=document.getElementById('feat-art');
  const ph=document.getElementById('feat-art-placeholder');
  if(ph) ph.remove();
  if(game.thumb_url){
    const preload=new Image();
    preload.onload=()=>{
      const oldImg=art.querySelector('.feat-art-img');
      if(oldImg){ oldImg.style.opacity='0'; setTimeout(()=>{ if(oldImg.parentNode) oldImg.remove(); },400); }
      const img=document.createElement('img');
      img.className='feat-art-img';
      img.src=game.thumb_url; img.alt=game.name;
      img.style.opacity='0';
      art.insertBefore(img, art.firstChild);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ img.style.opacity='1'; }));
    };
    preload.src=game.thumb_url;
  } else {
    const oldImg=art.querySelector('.feat-art-img');
    if(oldImg) oldImg.remove();
  }
  document.getElementById('feat-title').textContent=game.name;
  document.getElementById('feat-desc').textContent=game.description||'';
  const genreEl=document.getElementById('feat-genre');
  if(genreEl) genreEl.textContent=game.genre||'Roblox';
  const playBtn=document.getElementById('feat-play-btn');
  if(playBtn) playBtn.href=game.place_id?`https://www.roblox.com/es/games/${game.place_id}/`:'#';
  document.querySelectorAll('.car-dot').forEach((d,i)=>d.classList.toggle('on',i===idx));
  loadGameStats(game.place_id||CFG.GAME_PLACE_ID);
}

/* ═══════════════════════════════════════
   GAME STATS
   BUG 3+4 CORREGIDO: antes siempre leía el row id=1 de roblox_stats, ignorando
   el parámetro placeId — todos los juegos mostraban los mismos datos (o ninguno).
   Ahora lee visits/playing/favorites directamente de la tabla games (columnas
   actualizadas por refreshRobloxStats), resuelve el juego activo por place_id,
   y calcula los globales sumando TODOS los juegos de la DB.
═══════════════════════════════════════ */
async function loadGameStats(placeId){
  try{
    const {data:allGames} = await sb.from('games').select('place_id,visits,playing,favorites,status');
    if(!allGames||!allGames.length) return;

    // Totales globales: solo juegos publicados (status='live')
    const pubGames = allGames.filter(g=>g.status==='live');
    const totalVisits  = pubGames.reduce((s,g)=>s+(Number(g.visits)||0),  0);
    const totalPlaying = pubGames.reduce((s,g)=>s+(Number(g.playing)||0), 0);
    const totalFavs    = pubGames.reduce((s,g)=>s+(Number(g.favorites)||0),0);

    // Globales (home stats bar + stats page)
    const ev=document.getElementById('st-visits');  if(ev) ev.textContent=fmtNum(totalVisits);
    const ea=document.getElementById('st-active');  if(ea) ea.textContent=fmtNum(totalPlaying);
    const ef=document.getElementById('st-likes');   if(ef) ef.textContent=fmtNum(totalFavs);

    // Stats del juego activo en el carrusel (lookup por place_id, busca en todos los juegos)
    const game = allGames.find(g=>String(g.place_id)===String(placeId));
    const gv = game && game.visits   != null ? fmtNum(game.visits)   : fmtNum(totalVisits);
    const ga = game && game.playing  != null ? fmtNum(game.playing)  : fmtNum(totalPlaying);
    const gf = game && game.favorites!= null ? fmtNum(game.favorites): fmtNum(totalFavs);

    const fv=document.getElementById('feat-visits'); if(fv) fv.textContent=gv;
    const fa=document.getElementById('feat-active'); if(fa) fa.textContent=ga;
    const ff=document.getElementById('feat-likes');  if(ff) ff.textContent=gf;

  }catch(e){ console.warn('[loadGameStats]', e); }
}

/* ═══════════════════════════════════════
   TEAM
═══════════════════════════════════════ */
async function renderTeam(){
  const grid=document.getElementById('team-grid'); if(!grid) return;

  // Try loading from DB first; fall back to hardcoded TEAM if table missing or empty
  let dbMembers=null;
  try{
    const {data,error}=await sb.from('team_members').select('*').order('created_at',{ascending:true});
    if(!error&&data&&data.length) dbMembers=data;
  }catch(e){}

  if(dbMembers){
    // Render from team_members table
    const roles={};
    for(const m of dbMembers){ if(!roles[m.role]) roles[m.role]=[]; roles[m.role].push(m); }
    let html='';
    for(const [role,members] of Object.entries(roles)){
      html+=`<div class="team-role-section"><div class="team-role-hd">${role}</div>${members.map(m=>`
        <div class="team-member-link">
          <div class="tm-av" id="tm-av-db-${m.id}" style="display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--w3)">${(m.username||'?')[0].toUpperCase()}</div>
          <div class="tm-info">
            <div class="tm-name">${esc(m.username)}</div>
            <div class="tm-user">@${esc(m.username)}</div>
            <span class="tm-badge">${esc(role)}</span>
          </div>
        </div>`).join('')}</div>`;
    }
    grid.innerHTML=html;
    for(const m of dbMembers){ if(!m.avatar_url) continue;
      const av=document.getElementById('tm-av-db-'+m.id); if(!av) continue;
      av.innerHTML=`<img src="${esc(m.avatar_url)}" alt="${esc(m.username)}" style="width:100%;height:100%;object-fit:cover;border-radius:5px" onerror="this.style.display='none'"/>`;
      av.style.padding='0';
    }
    return;
  }

  // Fallback: render from hardcoded TEAM array in config.js
  const roles={};
  for(const m of TEAM){ if(!roles[m.role]) roles[m.role]=[]; roles[m.role].push(m); }
  let html='';
  for(const [role,members] of Object.entries(roles)){
    html+=`<div class="team-role-section"><div class="team-role-hd">${role}</div>${members.map(m=>`
      <a class="team-member-link" href="${m.profileUrl}" target="_blank" rel="noopener">
        <div class="tm-av" id="tm-av-${m.userId}" style="display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--w3)">${m.username[0].toUpperCase()}</div>
        <div class="tm-info">
          <div class="tm-name">${m.username}</div>
          <div class="tm-user">@${m.username}</div>
          <span class="tm-badge ${m.badge}">${role}</span>
        </div>
      </a>`).join('')}</div>`;
  }
  grid.innerHTML=html;
  for(const m of TEAM){ if(!m.avatarUrl) continue;
    const av=document.getElementById('tm-av-'+m.userId); if(!av) continue;
    av.innerHTML=`<img src="${m.avatarUrl}" alt="${m.username}" style="width:100%;height:100%;object-fit:cover;border-radius:5px" onerror="this.style.display='none'"/>`;
    av.style.padding='0';
  }
}

/* ═══════════════════════════════════════
   NEWS
═══════════════════════════════════════ */
const TN={u:'Update',e:'Evento',p:'Parche',l:'Lanzamiento'};
const TC={u:'nt-u',e:'nt-e',p:'nt-p',l:'nt-l'};
let NEWS_CACHE={};

async function renderSBNews(){
  const el=document.getElementById('home-news-sb'); if(!el) return;
  el.innerHTML='<div class="sn-empty">Cargando...</div>';
  const {data}=await sb.from('news').select('*').order('created_at',{ascending:false}).limit(6);
  if(!data||!data.length){el.innerHTML='<div class="sn-empty">No hay noticias publicadas todavía.</div>';return;}
  el.innerHTML=data.map(n=>`<div class="sn-item" onclick="openNM(${n.id})">
    <span class="sn-tag ${TC[n.type]}">${TN[n.type]}</span>
    <div class="sn-title">${esc(n.title)}</div>
    <div class="sn-date">${n.day} ${n.mon} ${n.yr}</div></div>`).join('');
}

async function renderAllNews(){
  const el=document.getElementById('all-news'); if(!el) return;
  el.innerHTML='<div class="empty">Cargando noticias...</div>';
  const {data}=await sb.from('news').select('*').order('created_at',{ascending:false});
  if(!data||!data.length){el.innerHTML='<div class="empty">No hay noticias publicadas todavía.</div>';return;}
  el.innerHTML=data.map(n=>`<div class="nc">
    <div class="nc-date"><div class="nc-day">${n.day}</div><div class="nc-mon">${n.mon}</div></div>
    <div class="nc-body" onclick="openNM(${n.id})" style="cursor:pointer">
      <span class="nc-tag ${TC[n.type]}">${TN[n.type]}</span>
      <div class="nc-title">${esc(n.title)}</div>
      <div class="nc-prev">${esc(n.prev||'')}</div>
    </div>
    <div class="nc-actions">${isAdmin()?`<button class="btn btn-danger btn-xs" onclick="deleteNews(${n.id})">✕</button>`:'<div class="nc-arr">›</div>'}</div>
  </div>`).join('');
}

async function openNM(id){
  document.getElementById('nm-ov').classList.add('on');
  document.body.style.overflow='hidden';
  document.getElementById('nm-title').textContent='Cargando...';
  ['nm-body','nm-date'].forEach(x=>{document.getElementById(x).textContent='';});
  let n=NEWS_CACHE[id];
  if(!n){const {data}=await sb.from('news').select('*').eq('id',id).single(); if(!data){closeNM();return;} n=data; NEWS_CACHE[id]=n;}
  document.getElementById('nm-tag').className='sn-tag '+TC[n.type];
  document.getElementById('nm-tag').textContent=TN[n.type];
  document.getElementById('nm-title').textContent=n.title;
  document.getElementById('nm-date').textContent=`${n.day} ${n.mon} ${n.yr}`;
  document.getElementById('nm-body').textContent=n.body;
}
function closeNM(){document.getElementById('nm-ov').classList.remove('on');document.body.style.overflow='';}

/* ═══════════════════════════════════════
   GAMES
   BUG 4 CORREGIDO: las tarjetas no tenían elementos HTML para stats. Se agregan
   gc-visits-{id} y gc-playing-{id} como un bloque de métricas dentro de gc-body,
   mostrando '—' hasta que refreshRobloxStats() escriba los datos en la DB.
═══════════════════════════════════════ */
async function renderGames(){
  const el=document.getElementById('all-games'); if(!el) return;
  el.innerHTML='<div class="empty">Cargando juegos...</div>';
  const {data}=await sb.from('games').select('*').order('id');
  GAMES_CACHE=data||[];
  if(!GAMES_CACHE.length){el.innerHTML='<div class="empty">No hay juegos todavía.</div>';return;}
  el.innerHTML=GAMES_CACHE.map(g=>{
    const hasStats = g.visits!=null||g.playing!=null;
    const statsBlock = `
      <div class="gc-stats">
        <div class="gc-stat-item">
          <span class="gc-stat-n" id="gc-visits-${g.id}">${g.visits!=null?fmtNum(g.visits):'—'}</span>
          <span class="gc-stat-l">Visitas</span>
        </div>
        <div class="gc-stat-item">
          <span class="gc-stat-n" id="gc-playing-${g.id}">${g.playing!=null?fmtNum(g.playing):'—'}</span>
          <span class="gc-stat-l">Jugando</span>
        </div>
        <div class="gc-stat-item">
          <span class="gc-stat-n" id="gc-favs-${g.id}">${g.favorites!=null?fmtNum(g.favorites):'—'}</span>
          <span class="gc-stat-l">Favoritos</span>
        </div>
      </div>`;
    return `<article class="gc" id="gc-${g.id}">
      <div class="gc-thumb" id="gct-${g.id}">
        <div class="gc-lbl">${g.name}</div>
        <span class="gc-badge ${gameStatusBadge(g.status)}">${gameStatusLabel(g.status)}</span>
      </div>
      <div class="gc-body">
        <div class="gc-genre">${g.genre||''}</div>
        <div class="gc-name">${g.name}</div>
        <div class="gc-desc">${g.description||''}</div>
        ${statsBlock}
        <div class="gc-tags">${(g.tags||[]).map(t=>`<span class="gtag">${t}</span>`).join('')}</div>
        <div class="gc-foot">
          ${g.status==='live'||g.status==='beta'?`<a class="btn btn-w btn-sm" href="https://www.roblox.com/es/games/${g.place_id}/" target="_blank">Jugar ↗</a>`:''}
          <a class="btn btn-o btn-sm" href="${CFG.GROUP_URL}" target="_blank">Grupo ↗</a>
          ${isAdmin()?`<button class="btn btn-danger btn-xs" onclick="admDeleteGame(${g.id})">Eliminar</button>`:''}
        </div>
      </div></article>`;
  }).join('');
  for(const g of GAMES_CACHE){
    const thumb=document.getElementById('gct-'+g.id); if(!thumb||!g.thumb_url) continue;
    thumb.innerHTML=`<img src="${g.thumb_url}" alt="${esc(g.name)}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none'"/><span class="gc-badge ${gameStatusBadge(g.status)}">${gameStatusLabel(g.status)}</span>`;
  }
  const lc=GAMES_CACHE.filter(x=>x.status==='live').length;
  const gp=document.getElementById('games-count'); if(gp) gp.textContent=`${lc} publicado${lc!==1?'s':''}`;
}

/* ═══════════════════════════════════════
   FORUM
═══════════════════════════════════════ */
const CN={todos:'Todos los hilos',general:'General',bugs:'Bugs',sugerencias:'Sugerencias','off-topic':'Off-topic'};
const CAT_COLORS={general:'tc-cat-general',bugs:'tc-cat-bugs',sugerencias:'tc-cat-sugerencias','off-topic':'tc-cat-off-topic'};
const CAT_TAG_COLORS={general:'nt-u',bugs:'nt-e',sugerencias:'nt-p','off-topic':'nt-l'};

async function renderForum(){ await updateCounts(); renderTL(); updateFUI(); }

async function updateCounts(){
  const {data}=await sb.from('threads').select('id,cat');
  THREADS_CACHE=data||[];
  const total=THREADS_CACHE.length;
  const c=cat=>THREADS_CACHE.filter(t=>t.cat===cat).length;
  [['fn-t',total],['fn-g',c('general')],['fn-b',c('bugs')],['fn-s',c('sugerencias')],['fn-o',c('off-topic')]]
    .forEach(([id,n])=>{const e=document.getElementById(id);if(e)e.textContent=n;});
  const e1=document.getElementById('fhs-threads'); if(e1) e1.textContent=total;
  const {count:pc}=await sb.from('posts').select('*',{count:'exact',head:true});
  const e2=document.getElementById('fhs-posts'); if(e2) e2.textContent=pc||0;
  const {count:uc}=await sb.from('users').select('*',{count:'exact',head:true});
  const e3=document.getElementById('fhs-members'); if(e3) e3.textContent=uc||0;
}

function updateFUI(){
  const btn=document.getElementById('new-t-btn'), gate=document.getElementById('f-gate');
  if(btn) btn.style.display=SES?'':'none';
  if(gate) gate.style.display=SES?'none':'';
}

function setCat(cat,el){
  curCat=cat;
  document.querySelectorAll('.fcat').forEach(c=>c.classList.remove('on'));
  if(el) el.classList.add('on');
  const t=document.getElementById('f-bar-t'); if(t) t.textContent=CN[cat]||cat;
  renderTL(); backForum();
}

async function renderTL(){
  const el=document.getElementById('thread-list'); if(!el) return;
  el.innerHTML='<div class="empty">Cargando hilos...</div>';
  let q=sb.from('threads').select('*').order('created_at',{ascending:false});
  if(curCat!=='todos') q=q.eq('cat',curCat);
  const {data}=await q;
  const list=data||[];
  if(!list.length){
    el.innerHTML=`<div class="forum-empty"><div class="forum-empty-icon">💬</div>
      <div class="forum-empty-title">No hay hilos todavía</div>
      <div class="forum-empty-sub">¡Sé el primero en abrir una conversación!</div></div>`;
    return;
  }
  const ids=list.map(t=>t.id);
  const {data:pcs}=await sb.from('posts').select('thread_id').in('thread_id',ids);
  const cm={};(pcs||[]).forEach(p=>{cm[p.thread_id]=(cm[p.thread_id]||0)+1;});
  el.innerHTML=list.map(t=>{
    const pc=cm[t.id]||0;
    const ts=new Date(t.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});
    return `<div class="tc" onclick="openThread(${t.id})">
      <div class="tc-cat-badge ${CAT_COLORS[t.cat]||'tc-cat-general'}"></div>
      <div class="tc-inner">
        <div class="tc-t">${esc(t.title)}</div>
        <div class="tc-m"><span class="tc-cat-tag ${CAT_TAG_COLORS[t.cat]||'nt-u'}">${CN[t.cat]||t.cat}</span> por <strong>${esc(t.author)}</strong> · ${ts}</div>
      </div>
      <div class="tc-stat"><div class="tc-n">${pc}</div><div class="tc-l">${pc===1?'post':'posts'}</div></div>
    </div>`;
  }).join('');
}

function toggleNT(){
  if(!SES){openAuth('in');return;}
  const f=document.getElementById('nt-form');
  f.classList.toggle('on');
  if(f.classList.contains('on')) document.getElementById('nt-title').focus();
}

async function doNT(){
  if(!SES){openAuth('in');return;}
  const title=document.getElementById('nt-title').value.trim();
  const cat=document.getElementById('nt-cat').value;
  if(!title) return;
  const btn=document.querySelector('.nt-row .btn-w');
  btn.textContent='Publicando...'; btn.disabled=true;
  const {data:thread,error}=await sb.from('threads').insert({cat,title,author:SES.username}).select().single();
  if(error){toast('Error al publicar hilo.','err');btn.textContent='Publicar hilo';btn.disabled=false;return;}
  await sb.from('posts').insert({thread_id:thread.id,author:SES.username,is_admin:SES.isAdmin,body:title});
  document.getElementById('nt-title').value='';
  document.getElementById('nt-form').classList.remove('on');
  btn.textContent='Publicar hilo'; btn.disabled=false;
  await renderForum(); toast('Hilo publicado.');
}

async function openThread(id){
  curThread=id;
  document.getElementById('tl-view').classList.add('hide');
  document.getElementById('td-view').classList.add('on');
  const rb=document.getElementById('reply-b'), rg=document.getElementById('reply-gate');
  if(SES){rb.classList.add('on');rg.style.display='none';}
  else{rb.classList.remove('on');rg.style.display='';}
  await renderTD(id);
}

function backForum(){
  curThread=null;
  document.getElementById('tl-view').classList.remove('hide');
  document.getElementById('td-view').classList.remove('on');
  document.getElementById('reply-b').classList.remove('on');
}

async function renderTD(threadId){
  const {data:t}=await sb.from('threads').select('*').eq('id',threadId).single(); if(!t) return;
  const hdr=document.getElementById('td-content-header');
  if(hdr) hdr.innerHTML=`<div class="td-title">${esc(t.title)}</div>
    <div class="td-meta"><span class="tc-cat-tag ${CAT_TAG_COLORS[t.cat]||'nt-u'}">${CN[t.cat]||t.cat}</span>
    <span>·</span><span>por ${esc(t.author)}</span>
    <span>·</span><span>${new Date(t.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'})}</span></div>`;
  const el=document.getElementById('td-content'); if(!el) return;
  el.innerHTML='<div class="empty">Cargando respuestas...</div>';
  const {data:posts}=await sb.from('posts').select('*').eq('thread_id',threadId).order('created_at');
  const postIds=(posts||[]).map(p=>p.id);
  let rm={};
  if(postIds.length){
    const {data:reacts}=await sb.from('reactions').select('*').in('post_id',postIds);
    (reacts||[]).forEach(r=>{
      const nk=`${r.post_id}-${r.type}`;
      rm[nk]=(rm[nk]||0)+1;
      if(SES&&r.username===SES.username) rm[`${r.post_id}-${r.type}-me`]=true;
    });
  }
  const pc=(posts||[]).length;
  if(hdr){
    const m=hdr.querySelector('.td-meta');
    if(m) m.innerHTML=`<span class="tc-cat-tag ${CAT_TAG_COLORS[t.cat]||'nt-u'}">${CN[t.cat]||t.cat}</span>
      <span>·</span><span>${pc} ${pc===1?'respuesta':'respuestas'}</span>
      <span>·</span><span>por ${esc(t.author)}</span>`;
  }
  el.innerHTML=`<div id="posts-wrap">${(posts||[]).map(p=>pHTML(p,t.id,rm)).join('')}</div>`;
}

function pHTML(p,tid,rm){
  const l=rm[`${p.id}-l`]||0, h=rm[`${p.id}-h`]||0, w=rm[`${p.id}-w`]||0;
  const ml=rm[`${p.id}-l-me`], mh=rm[`${p.id}-h-me`], mw=rm[`${p.id}-w-me`];
  const canDel=isAdmin()||(SES&&SES.username===p.author);
  const ts=new Date(p.created_at).toLocaleString('es-AR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  return `<div class="pc" id="post-${p.id}">
    <div class="p-h">
      <div class="p-av ${p.is_admin?'adm':''}">${p.author[0].toUpperCase()}</div>
      <div><span class="p-name">${esc(p.author)}</span>${p.is_admin?'<span class="p-role">Owner</span>':''}</div>
      <span class="p-time">${ts}</span>
    </div>
    <div class="p-body">${esc(p.body)}</div>
    <div class="p-footer">
      <div class="p-reacts">
        <button class="rb ${ml?'on':''}" onclick="react(${p.id},'l',${tid})">👍 <span class="rb-n">${l}</span></button>
        <button class="rb ${mh?'on':''}" onclick="react(${p.id},'h',${tid})">❤️ <span class="rb-n">${h}</span></button>
        <button class="rb ${mw?'on':''}" onclick="react(${p.id},'w',${tid})">😮 <span class="rb-n">${w}</span></button>
      </div>
      ${canDel?`<button class="btn btn-danger btn-xs" onclick="deletePost(${p.id},${tid})" style="margin-left:auto">Eliminar</button>`:''}
    </div>
  </div>`;
}

async function react(postId,type,threadId){
  if(!SES){openAuth('in');return;}
  const {data:ex}=await sb.from('reactions').select('id').eq('post_id',postId).eq('username',SES.username).eq('type',type).maybeSingle();
  if(ex) await sb.from('reactions').delete().eq('id',ex.id);
  else   await sb.from('reactions').insert({post_id:postId,username:SES.username,type});
  await renderTD(threadId);
}

async function deletePost(postId,threadId){
  if(!isAdmin()&&!SES) return;
  const {count}=await sb.from('posts').select('*',{count:'exact',head:true}).eq('thread_id',threadId);
  if(count<=1){
    if(!confirm('Es el único post. ¿Eliminar el hilo completo?')) return;
    await sb.from('threads').delete().eq('id',threadId);
    backForum(); await renderForum(); toast('Hilo eliminado.');
  } else {
    await sb.from('posts').delete().eq('id',postId);
    await renderTD(threadId); await updateCounts(); toast('Post eliminado.');
  }
}

async function doReply(){
  if(!SES){openAuth('in');return;}
  const ta=document.getElementById('reply-text');
  const body=ta.value.trim(); if(!body) return;
  const btn=document.querySelector('.rta-foot .btn-w');
  btn.textContent='Enviando...'; btn.disabled=true;
  const {error}=await sb.from('posts').insert({thread_id:curThread,author:SES.username,is_admin:SES.isAdmin,body});
  btn.textContent='Responder'; btn.disabled=false;
  if(error){toast('Error al publicar respuesta.','err');return;}
  ta.value=''; await renderTD(curThread); await updateCounts(); toast('Respuesta publicada.');
}

/* ═══════════════════════════════════════
   HOME FORUM PREVIEW
═══════════════════════════════════════ */
async function renderHomeForum(){
  const el = document.getElementById('home-forum-preview'); if(!el) return;
  el.innerHTML = '<div class="hf-empty">Cargando hilos...</div>';
  const {data:threads} = await sb.from('threads').select('*').order('created_at',{ascending:false}).limit(6);
  if(!threads||!threads.length){
    el.innerHTML='<div class="hf-empty">Todavía no hay hilos en el foro. <span style="cursor:pointer;color:var(--inf)" onclick="go(\'forum\')">¡Sé el primero!</span></div>';
    return;
  }
  const ids = threads.map(t=>t.id);
  const {data:pcs} = await sb.from('posts').select('thread_id').in('thread_id',ids);
  const cm={};(pcs||[]).forEach(p=>{cm[p.thread_id]=(cm[p.thread_id]||0)+1;});
  const CAT_TAG_COLORS_HF={general:'nt-u',bugs:'nt-e',sugerencias:'nt-p','off-topic':'nt-l'};
  const CN_HF={general:'General',bugs:'Bugs',sugerencias:'Sugerencias','off-topic':'Off-topic'};
  el.innerHTML = threads.map(t=>{
    const pc=cm[t.id]||0;
    const ts=new Date(t.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'short'});
    return `<div class="hf-card" onclick="go('forum')">
      <div class="hf-cat">
        <span class="tc-cat-tag ${CAT_TAG_COLORS_HF[t.cat]||'nt-u'}">${CN_HF[t.cat]||t.cat}</span>
      </div>
      <div class="hf-title">${esc(t.title)}</div>
      <div class="hf-meta">por <strong>${esc(t.author)}</strong> · ${ts} · <span>${pc} ${pc===1?'post':'posts'}</span></div>
    </div>`;
  }).join('');
}