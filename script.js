const tracks=[
{n:1,title:'мало-помалу',file:'audio/01-malo-pomalu.mp3',duration:'2:39',desc:'Вход в парк: праздничный фасад и первые признаки того, что за весельем скрывается нечто совсем другое.',cover:'assets/cover.jpg',key:'01-malo-pomalu'},
{n:2,title:'медленный танец',file:'audio/02-medlennyy-tanec.mp3',duration:'3:07',desc:'Игрушечность, память и тревога переплетаются: парк уже начинает показывать свою другую сторону.',cover:'assets/cover.jpg',key:'02-medlennyy-tanec'},
{n:3,title:'phantasmagoria',file:'audio/03-phantasmagoria.mp3',duration:'2:12',desc:'Центральная тема: детство, взросление и попытка разделить с кем-то собственные травмы.',cover:'assets/cover.jpg',key:'03-phantasmagoria'},
{n:4,title:'карусель',file:'audio/04-karusel.mp3',duration:'2:26',desc:'Карусель превращается в образ круга, который продолжает вращаться даже тогда, когда парк уже не безопасен.',cover:'assets/cover.jpg',key:'04-karusel'},
{n:5,title:'комната смеха',file:'audio/05-komnata-smeha.mp3',duration:'2:56',desc:'Кривые зеркала становятся метафорой искажения правды, памяти и собственного отражения.',cover:'assets/cover.jpg',key:'05-komnata-smeha'},
{n:6,title:'автодром',file:'audio/06-avtodrom.mp3',duration:'2:58',desc:'Жизнь как вечный автодром: столкновения, вина, страх и движение по кругу.',cover:'assets/cover.jpg',key:'06-avtodrom'},
{n:7,title:'свободное падение',file:'audio/07-svobodnoe-padenie.mp3',duration:'3:21',desc:'Высота и потеря контроля: аттракцион становится продолжением вины, страха и последствий.',cover:'assets/cover.jpg',key:'07-svobodnoe-padenie'},
{n:8,title:'эпилог',file:'audio/08-epilog.mp3',duration:'3:44',desc:'Финал истории: признание, последствия и попытка завершить то, что парк начал.',cover:'assets/cover.jpg',key:'08-epilog'}
];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const list=$('#trackList'),audio=$('#audio'),seek=$('#seek'),lyricsBox=$('#lyrics');
const store={get(k,d){try{return localStorage.getItem(k)??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const LEAD=.25;let off=0;let current=0,repeat=false,shuffle=false,lyrics=[],lineEls=[],activeIndex=-1,seeking=false,raf=0;
const esc=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=s=>isFinite(s)?String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0'):'00:00';

function renderTracks(){
  list.innerHTML=tracks.map((t,i)=>`<article class="track" data-i="${i}" tabindex="0" role="button" aria-label="Включить: ${esc(t.title)}"><div class="track-no">0${t.n}</div><div><div class="track-name">${esc(t.title)}</div><div class="track-desc">${esc(t.desc)}</div></div><div class="track-time">${t.duration}</div><div class="track-go">PLAY →</div></article>`).join('');
  $$('.track').forEach(x=>{const go=()=>{loadTrack(+x.dataset.i,true);$('#listen').scrollIntoView({behavior:'smooth'})};x.onclick=go;x.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});
}
function renderLyrics(t){
  lyrics=(window.LYRICS_DATA&&window.LYRICS_DATA[t.key])||[];activeIndex=-1;
  if(!lyrics.length){lyricsBox.innerHTML='<p class="lyrics-empty">Текст для этого трека не найден.</p>';lineEls=[];return}
  lyricsBox.innerHTML='<div class="sync-note">СИНХРОНИЗАЦИЯ · ИНТРО УЧТЕНО</div>'+lyrics.map((x,i)=>`<button class="lyric-line" data-index="${i}" type="button">${esc(x.text)}</button>`).join('');
  lineEls=$$('.lyric-line');lineEls.forEach((el,i)=>el.onclick=()=>{audio.currentTime=Math.max(0,lyrics[i].time-LEAD-off);updateLyrics(true);if(audio.paused)audio.play().catch(()=>{})});
  lyricsBox.scrollTop=0;updateLyrics(true);
}
function loadTrack(i,autoplay=false){
  current=(i+tracks.length)%tracks.length;const t=tracks[current];
  audio.src=t.file;audio.load();seek.value=0;
  $('#nowTitle').textContent=t.title;$('#nowDesc').textContent=t.desc;$('#nowCover').src=t.cover;
  $('#trackCounter').textContent=`0${t.n} / 08`;document.title=`${t.title} · MZLFF / PHANTASMAGORIA`;
  $$('.track').forEach((el,j)=>el.classList.toggle('selected',j===current));
  off=+store.get('ph:off:'+t.key,0)||0;showOff();renderLyrics(t);renderStory(t);store.set('ph:track',current);setMedia(t);
  if(autoplay)audio.play().catch(()=>showToast('Браузер заблокировал автозапуск — нажми ▶'));
}
function setMedia(t){
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:'MZLFF',album:'PHANTASMAGORIA',artwork:[{src:'assets/cover.jpg',sizes:'881x881',type:'image/jpeg'}]});
  navigator.mediaSession.setActionHandler('play',()=>audio.play());navigator.mediaSession.setActionHandler('pause',()=>audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack',prev);navigator.mediaSession.setActionHandler('nexttrack',next);
}
function next(){
  if(shuffle){let n=current;while(n===current&&tracks.length>1)n=Math.floor(Math.random()*tracks.length);current=n}
  else if(current<tracks.length-1)current++;else if(repeat)current=0;else{audio.pause();audio.currentTime=0;return}
  loadTrack(current,true);
}
function prev(){if(audio.currentTime>4){audio.currentTime=0;return}loadTrack(current-1,true)}
function updateLyrics(force=false){
  if(!lyrics.length)return;let idx=-1;const t=audio.currentTime+LEAD+off;
  for(let i=0;i<lyrics.length;i++){if(lyrics[i].time<=t)idx=i;else break}
  if(idx===activeIndex&&!force)return;activeIndex=idx;
  lineEls.forEach((el,i)=>{el.classList.toggle('active',i===idx);el.classList.toggle('past',i<idx);el.classList.toggle('future',i>idx)});
  const a=lineEls[idx];
  if(a&&!seeking){ // скроллим только блок текста, а не всю страницу
    const top=a.offsetTop-lyricsBox.clientHeight/2+a.clientHeight/2;
    lyricsBox.scrollTo({top,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
  }
}
function updateTime(){
  if(!seeking&&audio.duration)seek.value=audio.currentTime/audio.duration*1000;
  $('#currentTime').textContent=fmt(audio.currentTime);$('#duration').textContent=fmt(audio.duration);updateLyrics();
}
function loop(){updateTime();draw();raf=audio.paused?0:requestAnimationFrame(loop)}
function showToast(t){const x=$('#toast');x.textContent=t;x.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>x.classList.remove('show'),3600)}

/* ---- визуализатор: реальный спектр на http(s), мягкая анимация на file:// ---- */
const cv=$('#viz'),cx=cv.getContext('2d');let actx,an,data;
function initAnalyser(){
  if(actx||!/^https?:$/.test(location.protocol))return;
  try{actx=new(window.AudioContext||window.webkitAudioContext)();const s=actx.createMediaElementSource(audio);an=actx.createAnalyser();an.fftSize=128;an.smoothingTimeConstant=.82;s.connect(an);an.connect(actx.destination);data=new Uint8Array(an.frequencyBinCount)}catch(e){actx=an=null}
}
function draw(){
  const dpr=devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;
  if(cv.width!==w*dpr||cv.height!==h*dpr){cv.width=w*dpr;cv.height=h*dpr}
  cx.setTransform(dpr,0,0,dpr,0,0);cx.clearRect(0,0,w,h);
  const n=48,gap=4,bw=(w-gap*(n-1))/n,g=cx.createLinearGradient(0,0,w,0);
  g.addColorStop(0,'#7fd6f0');g.addColorStop(.6,'#9d8fe0');g.addColorStop(1,'#e39bc0');cx.fillStyle=g;
  if(an)an.getByteFrequencyData(data);const t=performance.now()/400;
  for(let i=0;i<n;i++){
    let v=an?data[Math.floor(i/n*data.length*.8)]/255:(audio.paused?.04:.25+.2*Math.sin(t+i*.5)*Math.sin(t*.7+i*.21));
    const bh=Math.max(3,v*h);cx.globalAlpha=.35+v*.65;cx.fillRect(i*(bw+gap),(h-bh)/2,bw,bh);
  }
  cx.globalAlpha=1;
}

/* ---- события ---- */
$('#play').onclick=()=>{initAnalyser();actx&&actx.resume();audio.paused?audio.play().catch(()=>{}):audio.pause()};
$('#prev').onclick=prev;$('#next').onclick=next;
$('#shuffle').onclick=e=>{shuffle=!shuffle;e.currentTarget.classList.toggle('active',shuffle);e.currentTarget.setAttribute('aria-pressed',shuffle)};
$('#repeat').onclick=e=>{repeat=!repeat;e.currentTarget.classList.toggle('active',repeat);e.currentTarget.setAttribute('aria-pressed',repeat)};
const vol=$('#volume');vol.value=store.get('ph:vol',.8);audio.volume=+vol.value;vol.oninput=e=>{audio.volume=e.target.value;store.set('ph:vol',e.target.value)};
seek.oninput=()=>{seeking=true;if(audio.duration){audio.currentTime=seek.value/1000*audio.duration;updateTime()}};
seek.onchange=()=>{seeking=false;updateLyrics(true)};
audio.onplay=()=>{initAnalyser();$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','Пауза');cancelAnimationFrame(raf);loop();if('mediaSession' in navigator)navigator.mediaSession.playbackState='playing'};
audio.onpause=()=>{$('#play').textContent='▶';$('#play').setAttribute('aria-label','Воспроизвести');updateTime();if('mediaSession' in navigator)navigator.mediaSession.playbackState='paused'};
audio.onloadedmetadata=updateTime;audio.onseeked=()=>{updateTime();updateLyrics(true)};audio.onended=next;
audio.onerror=()=>showToast('Не удалось загрузить аудио. Проверь, что папка audio/ загружена на GitHub.');
addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,button,.track,a'))return;
  if(e.code==='Space'){e.preventDefault();$('#play').click()}
  else if(e.key==='ArrowRight'){audio.currentTime=Math.min(audio.duration||0,audio.currentTime+5)}
  else if(e.key==='ArrowLeft'){audio.currentTime=Math.max(0,audio.currentTime-5)}
});
$('#lyricsHelp').onclick=()=>showToast('Текст подогнан к аудио. Если строки идут раньше или позже голоса, жми −0.5 / +0.5: сдвиг запомнится для трека.');

/* ---- навигация, появление секций, подсветка пункта меню ---- */
const nav=$('.topbar nav'),tg=$('.nav-toggle');
tg.onclick=()=>{const o=nav.classList.toggle('mobile-open');tg.setAttribute('aria-expanded',o)};
$$('.topbar nav a').forEach(a=>a.onclick=()=>{nav.classList.remove('mobile-open');tg.setAttribute('aria-expanded',false)});
addEventListener('keydown',e=>{if(e.key==='Escape'){nav.classList.remove('mobile-open');tg.setAttribute('aria-expanded',false)}});
if('IntersectionObserver' in window){
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.08});
  $$('.reveal').forEach(el=>io.observe(el));
  const links=$$('.topbar nav a'),so=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)links.forEach(l=>l.classList.toggle('on',l.getAttribute('href')==='#'+e.target.id))}),{rootMargin:'-45% 0px -50% 0px'});
  $$('main section[id]').forEach(s=>so.observe(s));
}else $$('.reveal').forEach(el=>el.classList.add('in'));


/* ---- сюжет, герои, подстройка текста ---- */
function showOff(){$('#offVal').textContent='SYNC '+(off>0?'+':'')+off.toFixed(1)+'s'}
function nudge(d){off=Math.round((off+d)*10)/10;store.set('ph:off:'+tracks[current].key,off);showOff();updateLyrics(true)}
$('#offMinus').onclick=()=>nudge(-.5);$('#offPlus').onclick=()=>nudge(.5);
function renderStory(t){
  const s=window.STORY&&window.STORY[t.key];const box=$('#storyBox');if(!s){box.innerHTML='';return}
  $('#nowCover').src='assets/art-'+s.art+'.jpg'.replace('art-cover.jpg','cover.jpg');
  if(s.art==='cover')$('#nowCover').src='assets/cover.jpg';
  box.innerHTML=`<div class="story-head"><span>${esc(s.act)}</span><b>${esc(s.tag)}</b></div>${s.text.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="story-key">${esc(s.key)}</div>`;
}
function renderPlot(){
  const el=$('#plot');if(!el||!window.STORY)return;
  el.innerHTML='<div class="plot-title">СЮЖЕТ ПО ТРЕКАМ</div>'+tracks.map((t,i)=>{const s=STORY[t.key];return `<button class="plot-step" data-i="${i}" type="button"><span>0${t.n}</span><b>${esc(t.title)}</b><i>${esc(s.act)}</i><p>${esc(s.key)}</p></button>`}).join('');
  $$('.plot-step').forEach(b=>b.onclick=()=>{loadTrack(+b.dataset.i,true);$('#listen').scrollIntoView({behavior:'smooth'})});
}
function renderChars(){
  const g=$('#charGrid');if(!g||!window.CHARS)return;
  g.innerHTML=CHARS.map(c=>`<article class="char"><img src="assets/art-${c.art}.jpg" alt="${esc(c.name)}" loading="lazy"><div><span>${esc(c.role)}</span><h3>${esc(c.name)}</h3><p>${esc(c.text)}</p></div></article>`).join('');
}
renderTracks();renderPlot();renderChars();loadTrack(Math.min(+store.get('ph:track',0)||0,tracks.length-1),false);draw();
