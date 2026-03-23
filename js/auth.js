/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
function openAuth(t){ document.getElementById('auth-ov').classList.add('on'); switchTab(t); }

function closeAuth(){
  document.getElementById('auth-ov').classList.remove('on');
  ['li-u','li-p','ru-u','ru-email','ru-phone','ru-p1','ru-p2'].forEach(id=>{
    const e=document.getElementById(id); if(e) e.value='';
  });
  document.getElementById('li-e').classList.remove('on');
  document.getElementById('ru-e').classList.remove('on');
}

function switchTab(t){
  document.getElementById('f-login').style.display = t==='in' ? '' : 'none';
  document.getElementById('f-reg').style.display   = t==='up' ? '' : 'none';
  document.getElementById('tab-in').classList.toggle('on', t==='in');
  document.getElementById('tab-up').classList.toggle('on', t==='up');
  const focus = t==='in' ? 'li-u' : 'ru-u';
  setTimeout(()=>{ const el=document.getElementById(focus); if(el) el.focus(); }, 60);
}

function swCt(t){
  curContact=t;
  document.getElementById('ct-e').classList.toggle('on', t==='email');
  document.getElementById('ct-p').classList.toggle('on', t==='phone');
  document.getElementById('ru-email').style.display = t==='email' ? '' : 'none';
  document.getElementById('ru-phone').style.display = t==='phone' ? '' : 'none';
}

/* ── LOGIN ── */
async function doLogin(){
  const u     = document.getElementById('li-u').value.trim();
  const p     = document.getElementById('li-p').value;
  const errEl = document.getElementById('li-e');
  errEl.textContent = 'Usuario o contraseña incorrectos.';
  errEl.classList.remove('on');

  if(!u || !p){ errEl.classList.add('on'); return; }

  const btn = document.getElementById('login-btn');
  if(btn){ btn.textContent='Entrando...'; btn.disabled=true; }

  let data=null, queryError=null;
  try{
    const res = await sb.from('users')
      .select('*')
      .eq('username', u)
      .eq('password', p)
      .maybeSingle();
    data       = res.data;
    queryError = res.error;
  } catch(err){
    queryError = err;
  }

  if(btn){ btn.textContent='Entrar'; btn.disabled=false; }

  if(queryError){
    errEl.textContent = 'Error de conexión. Revisá tu internet e intentá de nuevo.';
    errEl.classList.add('on');
    console.error('[doLogin] Supabase error:', queryError);
    return;
  }
  if(!data){
    errEl.textContent = 'Usuario o contraseña incorrectos.';
    errEl.classList.add('on');
    return;
  }

  saveSes({
    username:  data.username,
    isAdmin:   !!data.is_admin,
    isOwner:   data.username.toLowerCase() === CFG.ADMIN_USER.toLowerCase(),
    avatarUrl: data.avatar_url || null
  });
  closeAuth();
  renderNav();
  renderPage(curPage);
  toast('Bienvenido, ' + SES.username + '!');
}

/* ── REGISTRO ── */
async function doRegister(){
  const u  = document.getElementById('ru-u').value.trim();
  const ct = curContact==='email'
    ? document.getElementById('ru-email').value.trim()
    : document.getElementById('ru-phone').value.trim();
  const p  = document.getElementById('ru-p1').value;
  const p2 = document.getElementById('ru-p2').value;
  const err = document.getElementById('ru-e');
  const show = msg => { err.textContent=msg; err.classList.add('on'); };
  err.classList.remove('on');

  if(u.length<3)  return show('El usuario debe tener al menos 3 caracteres.');
  if(!ct)         return show('Completá el '+(curContact==='email'?'correo':'teléfono')+'.');
  if(p.length<6)  return show('La contraseña debe tener al menos 6 caracteres.');
  if(p!==p2)      return show('Las contraseñas no coinciden.');

  const btn = document.getElementById('register-btn');
  if(btn){ btn.textContent='Creando...'; btn.disabled=true; }

  try{
    const {data:ex, error:exErr} = await sb.from('users').select('id').eq('username',u).maybeSingle();
    if(exErr) throw exErr;
    if(ex){
      if(btn){ btn.textContent='Crear cuenta'; btn.disabled=false; }
      return show('Ese nombre de usuario ya está en uso.');
    }

    const {data, error} = await sb.from('users')
      .insert({ username:u, password:p, is_admin:false, contact:ct, contact_type:curContact })
      .select()
      .single();

    if(btn){ btn.textContent='Crear cuenta'; btn.disabled=false; }
    if(error) throw error;

    saveSes({
      username:  data.username,
      isAdmin:   false,
      isOwner:   false,
      avatarUrl: null
    });
    closeAuth();
    renderNav();
    renderPage(curPage);
    toast('¡Cuenta creada! Bienvenido, ' + u + '!');

  } catch(e){
    if(btn){ btn.textContent='Crear cuenta'; btn.disabled=false; }
    show('Error al crear la cuenta. Intentá de nuevo.');
    console.error('[doRegister]', e);
  }
}

/* ── LOGOUT ── */
function doLogout(){
  saveSes(null);
  renderNav();
  renderPage(curPage);
  toast('Sesión cerrada.');
}