/* ═══════════════════════════════════════
   SUPABASE
═══════════════════════════════════════ */
const SUPA_URL = 'https://lumfqxrmzupfoclsjben.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bWZxeHJtenVwZm9jbHNqYmVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDMxMTYsImV4cCI6MjA4OTc3OTExNn0.uSVBuw6X6CGQtxQeQEA5OpmHWIicg1XY8faSDEu4AuI';
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const CFG = {
  OWNER_EMAIL:'zj,feli.2020@gmail.com', ADMIN_USER:'Feli_ZJ', ADMIN_PASS:'admin123',
  GAME_PLACE_ID:'125258426847732',
  GAME_UNIVERSE_ID:'9918407627',
  GROUP_URL:'https://www.roblox.com/es/communities/143960370/Ashborne-Studios#!/about',
};
const TEAM = [
  { role:'Owner',     badge:'mb-admin', userId:'1152229864',  username:'Feli_ZJ',     profileUrl:'https://www.roblox.com/es/users/1152229864/profile',  avatarUrl:'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-6EB3B2F3AB0D99E565B5A6D55DDC8953-Png/150/150/AvatarHeadshot/Png/noFilter' },
  { role:'Developer', badge:'mb-dev',   userId:'10328273692', username:'DevRoblox_F',  profileUrl:'https://www.roblox.com/es/users/10328273692/profile', avatarUrl:'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-879DFC0E4D0DBF46C687409327C9ED54-Png/150/150/AvatarHeadshot/Png/noFilter' },
  { role:'Tester',    badge:'mb-test',  userId:'7677390461',  username:'00_Baruc9545', profileUrl:'https://www.roblox.com/es/users/7677390461/profile',  avatarUrl:null },
];

/* ═══════════════════════════════════════
   SESSION
═══════════════════════════════════════ */
let SES = (() => { try { return JSON.parse(localStorage.getItem('ash_ses')); } catch { return null; } })();
function saveSes(v){ SES=v; localStorage.setItem('ash_ses', JSON.stringify(v)); }

let curPage='home', curCat='todos', curThread=null, curContact='email';
let GAMES_CACHE=[], THREADS_CACHE=[], ALL_USERS_CACHE=[];

function isAdmin(){ return SES && SES.isAdmin; }
function isOwner(){ if(!SES) return false; if(SES.isOwner===true) return true; return (SES.username||'').toLowerCase()===CFG.ADMIN_USER.toLowerCase(); }

/* ═══════════════════════════════════════
   UTILIDADES GLOBALES
═══════════════════════════════════════ */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let toastTimer;
function toast(msg, type='ok'){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast show '+type;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.className='toast';},3000);
}