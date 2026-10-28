/* Progressive enhancement only: the page and the player stay fully usable
   without this file. Everything here is guarded and motion-aware. */
(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const media = window.matchMedia ? window.matchMedia.bind(window) : () => ({ matches: false });
  const reduced = () => media('(prefers-reduced-motion: reduce)').matches;
  const smooth = () => (reduced() ? 'auto' : 'smooth');

  /* ---- Scroll progress, condensed header and the back-to-top button ---- */
  const bar = $('#scrollBar');
  const header = $('.topbar');
  const toTop = $('#toTop');
  let queued = false;

  const paint = () => {
    queued = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (bar) bar.style.width = `${(progress * 100).toFixed(2)}%`;
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 24);
    if (toTop) {
      const show = window.scrollY > window.innerHeight * 1.4;
      toTop.hidden = !show;
    }
  };

  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  paint();

  if (toTop) {
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: smooth() });
      const link = $('.brand');
      if (link) link.focus({ preventScroll: true });
    });
  }

  /* ---- Hero: pointer spotlight and a whisper of parallax ---- */
  const opening = $('.opening');
  const spot = $('#heroSpot');
  const art = $('.art-photo');
  const fine = media('(pointer: fine)').matches;

  if (opening && spot && fine && !reduced()) {
    let frame = 0;
    let mouseX = 0;
    let mouseY = 0;

    const apply = () => {
      frame = 0;
      const box = opening.getBoundingClientRect();
      const x = mouseX - box.left;
      const y = mouseY - box.top;
      spot.style.setProperty('--spot-x', `${x}px`);
      spot.style.setProperty('--spot-y', `${y}px`);
      if (art) {
        const dx = (x / Math.max(1, box.width) - 0.5) * -18;
        const dy = (y / Math.max(1, box.height) - 0.5) * -12;
        art.style.setProperty('--hero-px', `${dx.toFixed(1)}px`);
        art.style.setProperty('--hero-py', `${dy.toFixed(1)}px`);
      }
    };

    opening.addEventListener('pointermove', event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      mouseX = event.clientX;
      mouseY = event.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    }, { passive: true });
  }

  /* ---- Gentle scroll parallax for the hero artwork (no layout thrash) ---- */
  if (art && !reduced()) {
    let frame = 0;
    const shift = () => {
      frame = 0;
      const offset = Math.min(window.scrollY, window.innerHeight);
      art.style.setProperty('--hero-scroll', `${(offset * 0.06).toFixed(1)}px`);
    };
    window.addEventListener('scroll', () => {
      if (frame) return;
      frame = requestAnimationFrame(shift);
    }, { passive: true });
  }

  /* ---- A restrained pointer tilt for the framed artwork ---- */
  if (fine && !reduced()) {
    document.querySelectorAll('.collage-photo, .artist-image, .tour-poster-large').forEach(card => {
      let frame = 0;
      let tx = 0;
      let ty = 0;

      const render = () => {
        frame = 0;
        card.style.setProperty('--tilt-x', `${tx.toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${ty.toFixed(2)}deg`);
      };

      card.addEventListener('pointermove', event => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        const box = card.getBoundingClientRect();
        ty = ((event.clientX - box.left) / box.width - 0.5) * 4;
        tx = -((event.clientY - box.top) / box.height - 0.5) * 4;
        card.classList.add('is-tilting');
        if (!frame) frame = requestAnimationFrame(render);
      }, { passive: true });

      card.addEventListener('pointerleave', () => {
        tx = 0;
        ty = 0;
        card.classList.remove('is-tilting');
        if (!frame) frame = requestAnimationFrame(render);
      });
    });
  }

  /* ---- Mark enhanced mode so CSS may rely on JavaScript being present ---- */
  document.documentElement.classList.add('js-enhanced');
})();
