/* ═══════════════════════════════════════
   ADMIN — TABS
═══════════════════════════════════════ */
function admTab(id, btn){
  document.querySelectorAll('.adm-pane').forEach(p=>p.style.display='none');
  document.querySelectorAll('.adm-tab').forEach(b=>b.classList.remove('on'));
  const el=document.getElementById('adm-'+id);
  if(el) el.style.display='';
  btn.classList.add('on');
  if(id==='adm-noticias') renderAdminNews();
  if(id==='adm-juegos')   renderAdminGames();
  if(id==='adm-usuarios') renderAdminUsers();
}

/* ═══════════════════════════════════════
   ESTADÍSTICAS PÚBLICAS
   BUG 5 CORREGIDO: antes leía roblox_stats id=1 (solo un juego). Ahora suma
   visits/playing/favorites de TODOS los rows de la tabla games para los globales.
   roblox_stats sigue usándose solo para group_members y updated_at.
═══════════════════════════════════════ */
async function loadPublicStats(){
  // Contadores del sitio
  const [u,t,p,n]=await Promise.all([
    sb.from('users').select('*',{count:'exact',head:true}),
    sb.from('threads').select('*',{count:'exact',head:true}),
    sb.from('posts').select('*',{count:'exact',head:true}),
    sb.from('news').select('*',{count:'exact',head:true}),
  ]);
  [['pub-cs-users',u.count],['pub-cs-threads',t.count],['pub-cs-posts',p.count],['pub-cs-news',n.count]]
    .forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=fmtNum(v);});

  // Stats de Roblox: suma de todos los juegos de la DB
  try{
    const {data:allGames} = await sb.from('games').select('visits,playing,favorites');
    if(allGames&&allGames.length){
      const totalVisits   = allGames.reduce((s,g)=>s+(Number(g.visits)||0),   0);
      const totalPlaying  = allGames.reduce((s,g)=>s+(Number(g.playing)||0),  0);
      const totalFavs     = allGames.reduce((s,g)=>s+(Number(g.favorites)||0),0);
      const ev=document.getElementById('pub-rs-visits');    if(ev) ev.textContent=fmtNum(totalVisits);
      const ep=document.getElementById('pub-rs-playing');   if(ep) ep.textContent=fmtNum(totalPlaying);
      const ef=document.getElementById('pub-rs-favorites'); if(ef) ef.textContent=fmtNum(totalFavs);
    }
  }catch(e){ console.warn('[loadPublicStats] games sum:', e); }

  // Miembros del grupo y timestamp siguen leyéndose de roblox_stats
  try{
    const {data}=await sb.from('roblox_stats').select('group_members,updated_at').eq('id',1).maybeSingle();
    if(data){
      const em=document.getElementById('pub-rs-members'); if(em) em.textContent=fmtNum(data.group_members);
      const upd=document.getElementById('pub-rs-updated');
      if(upd&&data.updated_at){
        const d=new Date(data.updated_at);
        upd.textContent='Actualizado: '+d.toLocaleDateString('es-AR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
      }
    }
  }catch(e){ console.warn('[loadPublicStats] roblox_stats:', e); }
}

/* ═══════════════════════════════════════
   REFRESH ROBLOX STATS
   BUG 1+2 CORREGIDO: antes solo consultaba CFG.GAME_UNIVERSE_ID (un juego fijo).
   Ahora:
   1. Lee todos los juegos con place_id desde la tabla games
   2. Resuelve cada place_id a universeId (con caché por sesión para evitar requests extra)
   3. Hace UNA sola request batch a la API de Roblox con todos los universeIds juntos
   4. Guarda visits/playing/favorites en cada row de games (por place_id)
   5. Actualiza roblox_stats solo para group_members y updated_at
   6. Refresca la UI completa: tarjetas, carrusel, stats page
═══════════════════════════════════════ */
const _universeIdCache = {};  // place_id → universeId, persiste durante la sesión

async function resolveUniverseId(placeId){
  if(!placeId) return null;
  const key = String(placeId);
  if(_universeIdCache[key]) return _universeIdCache[key];
  const uId = await getUniverseId(placeId);
  if(uId) _universeIdCache[key] = uId;
  return uId;
}

async function refreshRobloxStats(){
  const btn=document.getElementById('btn-refresh-stats')||document.getElementById('refresh-stats-btn');
  if(btn){btn.textContent='Actualizando...';btn.disabled=true;}

  const GROUP_ID='143960370';
  let group_members=0;
  let anySuccess=false;

  try{
    // 1. Leer todos los juegos con place_id
    const {data:games, error:gErr} = await sb.from('games').select('id,place_id,name');
    if(gErr) throw gErr;

    const gamesWithPlace = (games||[]).filter(g=>g.place_id);

    if(gamesWithPlace.length===0){
      toast('No hay juegos con Place ID para actualizar.','err');
      if(btn){btn.textContent='Actualizar stats';btn.disabled=false;}
      return;
    }

    // 2. Resolver todos los universeIds (en paralelo, con caché)
    const resolved = await Promise.all(
      gamesWithPlace.map(async g=>({
        ...g,
        universeId: await resolveUniverseId(g.place_id)
      }))
    );
    const withUniverse = resolved.filter(g=>g.universeId);

    if(withUniverse.length===0){
      toast('No se pudieron resolver los Universe IDs.','err');
      if(btn){btn.textContent='Actualizar stats';btn.disabled=false;}
      return;
    }

    // 3. Batch request: todos los universeIds en una sola llamada
    const uIds = withUniverse.map(g=>g.universeId).join(',');
    const proxies=[
      'https://games.roproxy.com/v1/games?universeIds='+uIds,
      'https://games.roblox.com/v1/games?universeIds='+uIds,
    ];

    let rbxData=null;
    for(const url of proxies){
      try{
        const r=await fetch(url);
        if(r.ok){
          const d=await r.json();
          if(d&&d.data&&d.data.length){ rbxData=d.data; break; }
        }
      }catch(e){}
    }

    if(!rbxData){
      toast('No se pudo conectar con la API de Roblox.','err');
      if(btn){btn.textContent='Actualizar stats';btn.disabled=false;}
      return;
    }

    // 4. Construir mapa universeId → stats
    const statsMap={};
    for(const item of rbxData){
      statsMap[String(item.universeId)]={
        visits:   item.visits||0,
        playing:  item.playing||0,
        favorites:item.favoritedCount||0,
      };
    }

    // 5. Actualizar cada row de games con sus stats individuales
    const updates = withUniverse.map(g=>{
      const s=statsMap[g.universeId];
      if(!s) return null;
      return sb.from('games').update({
        visits:   s.visits,
        playing:  s.playing,
        favorites:s.favorites,
      }).eq('id', g.id);
    }).filter(Boolean);

    const results = await Promise.all(updates);
    const errors  = results.map(r=>r.error).filter(Boolean);
    if(errors.length){
      console.error('[refreshRobloxStats] update errors:', errors);
    }

    // Calcular totales para el toast
    const totalVisits  = withUniverse.reduce((s,g)=>s+(statsMap[g.universeId]?.visits||0),0);
    const totalPlaying = withUniverse.reduce((s,g)=>s+(statsMap[g.universeId]?.playing||0),0);
    anySuccess = results.some(r=>!r.error);

    // 6. Group members → roblox_stats (sigue igual)
    const groupProxies=[
      'https://groups.roproxy.com/v1/groups/'+GROUP_ID,
      'https://groups.roblox.com/v1/groups/'+GROUP_ID,
    ];
    for(const url of groupProxies){
      try{
        const r=await fetch(url);
        if(r.ok){const d=await r.json();if(d&&d.memberCount){group_members=d.memberCount;break;}}
      }catch(e){}
    }

    await sb.from('roblox_stats').upsert({
      id:1, group_members, updated_at:new Date().toISOString()
    });

    if(btn){btn.textContent='Actualizar stats';btn.disabled=false;}

    if(anySuccess){
      toast(`Stats actualizados ✓  ${withUniverse.length} juego${withUniverse.length!==1?'s':''} · ${fmtNum(totalVisits)} visitas · ${fmtNum(totalPlaying)} jugando`);
    } else {
      toast('No se guardaron los stats. Revisá los permisos de Supabase.','err');
    }

  }catch(e){
    console.error('[refreshRobloxStats]', e);
    toast('Error inesperado: '+e.message,'err');
    if(btn){btn.textContent='Actualizar stats';btn.disabled=false;}
    return;
  }

  // 7. Refrescar toda la UI con los nuevos datos
  await loadPublicStats();
  await loadGameStats(CFG.GAME_PLACE_ID);
  // Refrescar las tarjetas de juegos si la página está activa
  if(curPage==='games') await renderGames();
}

/* legacy */
async function loadContentStats(){ loadPublicStats(); }
async function loadRobloxStats(){}

/* ═══════════════════════════════════════
   ADMIN — NOTICIAS
═══════════════════════════════════════ */
async function admPubNews(){
  if(!isAdmin()){toast('Sin permiso.','err');return;}
  const title=(document.getElementById('adm-pub-title').value||'').trim();
  const body=(document.getElementById('adm-pub-body').value||'').trim();
  const type=document.getElementById('adm-pub-type').value;
  if(!title||!body){toast('Completá título y contenido.','err');return;}
  const d=new Date();
  const M=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const {error}=await sb.from('news').insert({
    type, title, body,
    prev:body.slice(0,90)+(body.length>90?'…':''),
    day:String(d.getDate()).padStart(2,'0'),
    mon:M[d.getMonth()],
    yr:d.getFullYear()
  });
  if(error){toast('Error al publicar: '+error.message,'err');console.error(error);return;}
  document.getElementById('adm-pub-title').value='';
  document.getElementById('adm-pub-body').value='';
  renderAllNews(); renderSBNews(); renderAdminNews();
  toast('Noticia publicada.');
}

async function renderAdminNews(){
  const el=document.getElementById('adm-news-list'); if(!el) return;
  el.innerHTML='<div class="empty">Cargando...</div>';
  const {data,error}=await sb.from('news').select('*').order('created_at',{ascending:false});
  if(error){el.innerHTML='<div class="empty">Error al cargar.</div>';return;}
  if(!data||!data.length){el.innerHTML='<div class="empty">No hay noticias publicadas.</div>';return;}
  el.innerHTML=`<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th>Título</th><th>Tipo</th><th>Fecha</th><th>Acción</th></tr></thead>
    <tbody>${data.map(n=>`<tr>
      <td style="font-weight:500;color:var(--w)">${esc(n.title)}</td>
      <td><span class="sn-tag ${TC[n.type]||''}">${TN[n.type]||n.type}</span></td>
      <td style="font-size:12px;color:var(--w3)">${n.day} ${n.mon} ${n.yr}</td>
      <td><button class="btn btn-danger btn-xs" onclick="admDeleteNews(${n.id})">Eliminar</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

async function admDeleteNews(id){
  if(!isAdmin()){toast('Sin permiso.','err');return;}
  if(!confirm('¿Eliminar esta noticia?')) return;
  const {error}=await sb.from('news').delete().eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  renderAllNews(); renderSBNews(); renderAdminNews();
  toast('Noticia eliminada.');
}

/* ═══════════════════════════════════════
   ADMIN — JUEGOS
═══════════════════════════════════════ */
function gameStatusLabel(s){
  if(s==='live') return 'Disponible';
  if(s==='beta') return 'Beta';
  return 'En desarrollo';
}
function gameStatusBadge(s){
  if(s==='live') return 'gb-live';
  if(s==='beta') return 'gb-beta';
  return 'gb-dev';
}

async function admAddGame(){
  if(!isAdmin()){toast('Sin permiso.','err');return;}
  const place_id=(document.getElementById('adm-gf-placeId').value||'').trim();
  const name=(document.getElementById('adm-gf-name').value||'').trim();
  const description=(document.getElementById('adm-gf-desc').value||'').trim();
  const genre=(document.getElementById('adm-gf-genre').value||'').trim();
  const tagsRaw=(document.getElementById('adm-gf-tags').value||'');
  const tags=tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);
  const status=document.getElementById('adm-gf-status').value;
  if(!name||!description){toast('Completá nombre y descripción.','err');return;}
  const btn=document.getElementById('adm-add-game-btn');
  btn.textContent='Guardando...'; btn.disabled=true;
  let thumb_url=null;
  if(place_id){
    toast('Resolviendo imagen...','ok');
    try{
      const uId=await getUniverseId(place_id);
      if(uId){
        const td=await rbxFetch(`https://thumbnails.roproxy.com/v1/games/multiget/thumbnails?universeIds=${uId}&countPerUniverse=1&defaults=true&size=768x432&format=Png&isCircular=false`);
        if(td) thumb_url=td?.data?.[0]?.thumbnails?.[0]?.imageUrl||null;
      }
    }catch(e){console.warn('thumb error',e);}
  }
  const {error}=await sb.from('games').insert({
    place_id:place_id||null, name, description,
    genre:genre||'Roblox', tags, status, thumb_url,
    visits:null, playing:null, favorites:null
  });
  btn.textContent='Agregar juego'; btn.disabled=false;
  if(error){toast('Error al agregar: '+error.message,'err');console.error(error);return;}
  ['adm-gf-placeId','adm-gf-name','adm-gf-desc','adm-gf-genre','adm-gf-tags'].forEach(id=>{
    const e=document.getElementById(id); if(e) e.value='';
  });
  renderGames(); renderFeatGame(); renderAdminGames();
  toast('Juego agregado'+(thumb_url?' con imagen.':'.'));
}

async function renderAdminGames(){
  const el=document.getElementById('adm-games-list'); if(!el) return;
  el.innerHTML='<div class="empty">Cargando...</div>';
  const {data,error}=await sb.from('games').select('*').order('created_at',{ascending:false});
  if(error){el.innerHTML='<div class="empty">Error al cargar.</div>';return;}
  if(!data||!data.length){el.innerHTML='<div class="empty">No hay juegos.</div>';return;}
  el.innerHTML=`<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th>Nombre</th><th>Estado</th><th>Place ID</th><th>Visitas</th><th>Jugando</th><th>Acciones</th></tr></thead>
    <tbody>${data.map(g=>`<tr>
      <td style="font-weight:500;color:var(--w)">${esc(g.name)}</td>
      <td><span class="gc-badge ${gameStatusBadge(g.status)}" style="position:static;font-size:9px">${gameStatusLabel(g.status)}</span></td>
      <td style="font-size:12px;color:var(--w3)">${g.place_id||'—'}</td>
      <td style="font-size:12px;color:var(--w2)">${g.visits!=null?fmtNum(g.visits):'—'}</td>
      <td style="font-size:12px;color:var(--w2)">${g.playing!=null?fmtNum(g.playing):'—'}</td>
      <td><div class="adm-actions">
        <select class="fsel" style="font-size:11px;padding:4px 8px" onchange="admSetGameStatus(${g.id},this.value)">
          <option value="dev"  ${g.status==='dev' ?'selected':''}>En desarrollo</option>
          <option value="beta" ${g.status==='beta'?'selected':''}>Beta</option>
          <option value="live" ${g.status==='live'?'selected':''}>Disponible</option>
        </select>
        <button class="btn btn-danger btn-xs" onclick="admDeleteGame(${g.id})">Eliminar</button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

async function admSetGameStatus(id, status){
  const {error}=await sb.from('games').update({status}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  toast('Estado: '+gameStatusLabel(status));
  renderGames(); renderFeatGame();
}

async function admDeleteGame(id){
  if(!isAdmin()){toast('Sin permiso.','err');return;}
  if(!confirm('¿Eliminar este juego?')) return;
  const {error}=await sb.from('games').delete().eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  renderGames(); renderFeatGame(); renderAdminGames();
  toast('Juego eliminado.');
}

/* ═══════════════════════════════════════
   ADMIN — USUARIOS (solo Owner)
═══════════════════════════════════════ */
let ALL_USERS=[];

async function renderAdminUsers(){
  if(!isAdmin()){toast('Acceso denegado.','err');go('home');return;}
  const gate=document.getElementById('adm-users-gate');
  const content=document.getElementById('adm-users-content');
  const owner = SES && (SES.isOwner===true || SES.username===CFG.ADMIN_USER);
  if(!owner){
    if(gate){
      gate.style.display='';
      gate.innerHTML=`<div class="empty" style="color:var(--err);padding:2rem 0">
        Solo el Owner puede gestionar usuarios.<br>
        <small style="color:var(--w4);font-size:11px">Sesión: <b>${SES?.username}</b></small>
      </div>`;
    }
    if(content) content.style.display='none';
    return;
  }
  if(gate) gate.style.display='none';
  if(content) content.style.display='';
  const tbody=document.getElementById('adm-user-rows');
  if(tbody) tbody.innerHTML='<tr><td colspan="5" class="adm-loading">Cargando...</td></tr>';
  const {data,error}=await sb.from('users').select('*').order('created_at',{ascending:true});
  if(error){if(tbody)tbody.innerHTML=`<tr><td colspan="5" class="adm-loading" style="color:var(--err)">Error: ${error.message}</td></tr>`;return;}
  ALL_USERS=data||[];
  renderUserRows(ALL_USERS);
  const cnt=document.getElementById('adm-user-count');
  if(cnt) cnt.textContent=`${ALL_USERS.length} usuario${ALL_USERS.length!==1?'s':''}`;
}

function filterAdmUsers(){
  const q=(document.getElementById('adm-search').value||'').toLowerCase();
  renderUserRows(ALL_USERS.filter(u=>
    (u.username||'').toLowerCase().includes(q)||
    (u.contact||'').toLowerCase().includes(q)
  ));
}

function renderUserRows(users){
  const tbody=document.getElementById('adm-user-rows'); if(!tbody) return;
  if(!users.length){
    tbody.innerHTML='<tr><td colspan="5" class="adm-loading">No se encontraron usuarios.</td></tr>';
    return;
  }
  tbody.innerHTML=users.map(u=>{
    const isOwnerRow = (u.username||'').toLowerCase()===CFG.ADMIN_USER.toLowerCase();
    const badge = isOwnerRow
      ? '<span class="adm-badge adm-badge-owner">Owner</span>'
      : u.is_admin
        ? '<span class="adm-badge adm-badge-admin">Admin</span>'
        : '<span class="adm-badge adm-badge-user">Usuario</span>';
    const ts = u.created_at
      ? new Date(u.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'})
      : '—';
    const actions = isOwnerRow
      ? '<span style="font-size:11px;color:var(--w4)">No editable</span>'
      : `<div class="adm-actions">
          ${u.is_admin
            ? `<button class="btn btn-o btn-xs" onclick="setAdmin('${u.id}',false)">Quitar admin</button>`
            : `<button class="btn btn-w btn-xs" onclick="setAdmin('${u.id}',true)">Hacer admin</button>`}
          <button class="btn btn-danger btn-xs" onclick="deleteUser('${u.id}','${esc(u.username)}')">Eliminar</button>
        </div>`;
    return `<tr>
      <td><span style="font-weight:600;color:var(--w)">${esc(u.username)}</span></td>
      <td style="font-size:12px;color:var(--w3)">${esc(u.contact||'—')} <span style="color:var(--w4)">(${u.contact_type||'—'})</span></td>
      <td>${badge}</td>
      <td style="font-size:12px;color:var(--w3)">${ts}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

async function setAdmin(userId, makeAdmin){
  const owner = SES && (SES.isOwner===true || SES.username===CFG.ADMIN_USER);
  if(!owner){toast('Solo el Owner puede cambiar roles.','err');return;}
  const {data,error}=await sb.from('users').update({is_admin:makeAdmin}).eq('id',userId).select();
  if(error){toast('Error: '+error.message,'err');console.error('setAdmin',error);return;}
  if(!data||data.length===0){toast('Usuario no encontrado.','err');return;}
  toast(makeAdmin ? 'Admin asignado ✓ El usuario debe recargar la página.' : 'Admin removido ✓');
  await renderAdminUsers();
}

async function deleteUser(userId, username){
  const owner = SES && (SES.isOwner===true || SES.username===CFG.ADMIN_USER);
  if(!owner){toast('Solo el Owner puede eliminar usuarios.','err');return;}
  if(!confirm(`¿Eliminar al usuario "${username}"? No se puede deshacer.`)) return;
  const {error}=await sb.from('users').delete().eq('id',userId);
  if(error){toast('Error: '+error.message,'err');console.error('deleteUser',error);return;}
  toast('Usuario eliminado.');
  await renderAdminUsers();
}

async function nukeThreads(){
  const owner = SES && (SES.isOwner===true || SES.username===CFG.ADMIN_USER);
  if(!owner) return;
  if(!confirm('¿Eliminar TODOS los hilos y posts? No se puede deshacer.')) return;
  await sb.from('posts').delete().neq('id',0);
  await sb.from('threads').delete().neq('id',0);
  toast('Foro limpiado.');
}

async function nukeNews(){
  const owner = SES && (SES.isOwner===true || SES.username===CFG.ADMIN_USER);
  if(!owner) return;
  if(!confirm('¿Eliminar TODAS las noticias? No se puede deshacer.')) return;
  await sb.from('news').delete().neq('id',0);
  renderAllNews(); renderSBNews();
  toast('Noticias eliminadas.');
}