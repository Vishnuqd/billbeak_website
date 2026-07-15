/**
 * at-hero-fx — interactive hero for Billbeak.
 * Layers (each independent): triangular mesh + pointer spring physics,
 * cursor light, cycling keywords, an occasional "connection path" that
 * lights a route through the network, and subtle multi-speed parallax.
 * Vanilla JS + GSAP (already loaded). No Three.js, no framework.
 */
(function () {
    'use strict';

    var hero = document.querySelector('.at-hero-area .at-hero-fx');
    if (!hero) return;
    var section = hero.closest('.at-hero-area');
    var canvas = hero.querySelector('.at-hero-fx__canvas');
    var lightEl = hero.querySelector('.at-hero-fx__light');
    var wordEl = hero.querySelector('.at-hero-fx__word');
    var keywordsEl = hero.querySelector('.at-hero-fx__keywords');
    if (!section || !canvas) return;

    var ctx = canvas.getContext('2d');
    var hasGsap = typeof window.gsap !== 'undefined';
    var mq = window.matchMedia;
    var reduce = mq && mq('(prefers-reduced-motion: reduce)').matches;
    var fine = mq && mq('(hover: hover) and (pointer: fine)').matches;

    // ---- Tunables -------------------------------------------------------
    var TARGET_SPACING = 104; // px between grid points → finer mesh
    var JITTER = 0.24; // interior vertex randomness (× spacing)
    var RADIUS = 160; // pointer influence radius
    var MAX_DISP = 13; // max vertex displacement toward cursor
    var STIFF = 0.075, DAMP = 0.82; // spring
    var EDGE_ALPHA = 0.055, EDGE_HI = 0.18; // line opacity base / near cursor
    var DOT_ALPHA = 0.09;
    var PARALLAX_MESH = 16, PARALLAX_WORD = 24;
    var WORD_ALPHA = 0.9;
    var WORDS = ['Discover', 'Learn', 'Build', 'Create', 'Collaborate', 'Connect', 'Contribute', 'Showcase', 'Verify', 'Prove', 'Mentor', 'Grow', 'Belong', 'Elevate', 'Illuminate', 'Thrive', 'Rise', 'Get Hired'];

    var w = 0, h = 0, dpr = 1;
    var vertices = [], edges = [], adjacency = [], particles = [];
    var kwX = 0, kwY = 0; // keyword centre (for mesh highlight)

    var pointer = { x: -9999, y: -9999, nx: 0, ny: 0, inside: false, lastMove: 0 };
    var par = { x: 0, y: 0, tx: 0, ty: 0 }; // eased mesh parallax offset

    // ---- Mesh build -----------------------------------------------------
    function rand(a, b) { return a + Math.random() * (b - a); }

    function seededRand(seed) {
        // deterministic per-vertex jitter so resize doesn't reshuffle wildly
        var x = Math.sin(seed * 127.1) * 43758.5453;
        return x - Math.floor(x);
    }

    function buildMesh() {
        vertices = []; edges = []; adjacency = [];
        var cols = Math.max(6, Math.min(18, Math.round(w / TARGET_SPACING)));
        var rows = Math.max(5, Math.min(12, Math.round(h / TARGET_SPACING)));
        var sx = w / cols, sy = h / rows;
        var index = [];
        var id = 0;
        // one extra ring outside the canvas so parallax offset never bares an edge
        for (var j = -1; j <= rows + 1; j++) {
            index[j + 1] = [];
            for (var i = -1; i <= cols + 1; i++) {
                var bx = i * sx, by = j * sy;
                var interior = i > 0 && i < cols && j > 0 && j < rows;
                if (interior) {
                    bx += (seededRand(id + 1) - 0.5) * sx * 2 * JITTER;
                    by += (seededRand(id + 101) - 0.5) * sy * 2 * JITTER;
                }
                vertices.push({ bx: bx, by: by, x: bx, y: by, vx: 0, vy: 0 });
                adjacency.push([]);
                index[j + 1][i + 1] = id++;
            }
        }
        var seen = {};
        function link(a, b) {
            if (a == null || b == null) return;
            var key = a < b ? a + '_' + b : b + '_' + a;
            if (seen[key]) return;
            seen[key] = 1;
            edges.push([a, b]);
            adjacency[a].push(b);
            adjacency[b].push(a);
        }
        for (var jj = -1; jj <= rows; jj++) {
            for (var ii = -1; ii <= cols; ii++) {
                var a = index[jj + 1][ii + 1];
                var b = index[jj + 1][ii + 2];
                var c = index[jj + 2][ii + 1];
                var d = index[jj + 2][ii + 2];
                link(a, b); link(a, c); link(a, d); // two triangles per cell
                link(b, d); link(c, d);
            }
        }
    }

    function measureKeyword() {
        if (!keywordsEl) return;
        var r = keywordsEl.getBoundingClientRect();
        var hr = canvas.getBoundingClientRect();
        kwX = r.left - hr.left + r.width / 2;
        kwY = r.top - hr.top + r.height / 2;
    }

    function resize() {
        var r = section.getBoundingClientRect();
        w = r.width; h = r.height;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildMesh();
        measureKeyword();
        if (!running) drawStatic();
    }

    // ---- Connection path (occasional storytelling) ----------------------
    var path = { nodes: [], p: 0, alpha: 0, active: false };

    function pickPath() {
        if (!vertices.length || !adjacency.length) return;
        // start on-screen (and clear of the dense title band) so the route
        // is always visible rather than wandering off in the outer ring
        var pool = [];
        for (var k = 0; k < vertices.length; k++) {
            var vv = vertices[k];
            if (vv.bx > w * 0.12 && vv.bx < w * 0.88 && vv.by > h * 0.12 && vv.by < h * 0.82) pool.push(k);
        }
        if (!pool.length) return;
        var start = pool[Math.floor(rand(0, pool.length))];
        var nodes = [start];
        var used = {}; used[start] = 1;
        for (var s = 0; s < 5; s++) {
            var nbrs = adjacency[nodes[nodes.length - 1]].filter(function (n) { return !used[n]; });
            if (!nbrs.length) break;
            var next = nbrs[Math.floor(rand(0, nbrs.length))];
            used[next] = 1; nodes.push(next);
        }
        if (nodes.length < 3) return;
        path.nodes = nodes; path.p = 0; path.alpha = 0; path.active = true;
        if (hasGsap) {
            gsap.killTweensOf(path);
            var tl = gsap.timeline({ onComplete: function () { path.active = false; schedulePath(); } });
            tl.to(path, { alpha: 1, duration: 0.4, ease: 'power2.out' }, 0)
              .to(path, { p: 1, duration: 2.1, ease: 'power1.inOut' }, 0)
              .to(path, { alpha: 0, duration: 0.6, ease: 'power2.in' }, '-=0.35');
        } else {
            path.p = 1; path.alpha = 1;
            setTimeout(function () { path.active = false; schedulePath(); }, 2600);
        }
    }

    var pathTimer = null;
    function schedulePath() {
        clearTimeout(pathTimer);
        pathTimer = setTimeout(function () { if (running) pickPath(); }, rand(8000, 13000));
    }

    // ---- Draw -----------------------------------------------------------
    function drawEdges() {
        var px = par.x, py = par.y;
        for (var e = 0; e < edges.length; e++) {
            var a = vertices[edges[e][0]], b = vertices[edges[e][1]];
            var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            var alpha = EDGE_ALPHA;
            if (pointer.inside) {
                var dc = Math.hypot(mx - pointer.x, my - pointer.y);
                if (dc < RADIUS) alpha += (EDGE_HI - EDGE_ALPHA) * (1 - dc / RADIUS);
            }
            var dk = Math.hypot(mx - kwX, my - kwY);
            if (dk < 190) alpha += 0.05 * (1 - dk / 190);
            ctx.strokeStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x + px, a.y + py);
            ctx.lineTo(b.x + px, b.y + py);
            ctx.stroke();
        }
    }

    function drawDots() {
        var px = par.x, py = par.y;
        for (var i = 0; i < vertices.length; i++) {
            var v = vertices[i];
            var alpha = DOT_ALPHA;
            if (pointer.inside) {
                var d = Math.hypot(v.x - pointer.x, v.y - pointer.y);
                if (d < RADIUS) alpha += 0.25 * (1 - d / RADIUS);
            }
            ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(v.x + px, v.y + py, 1.1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Particle scatter — the mesh "dissolves" into a drifting cloud around
    // the cursor while hovering, then the particles fade back out.
    function spawnParticles() {
        if (!pointer.inside) return;
        for (var s = 0; s < 5; s++) {
            if (particles.length >= 160) break;
            var ang = Math.random() * Math.PI * 2;
            var rad = Math.random() * RADIUS * 0.55;
            var vang = Math.random() * Math.PI * 2;
            var sp = 0.15 + Math.random() * 0.9;
            particles.push({
                x: pointer.x + Math.cos(ang) * rad,
                y: pointer.y + Math.sin(ang) * rad,
                vx: Math.cos(vang) * sp,
                vy: Math.sin(vang) * sp - 0.2,
                life: 1,
                decay: 0.009 + Math.random() * 0.013,
                size: 0.6 + Math.random() * 1.5,
            });
        }
    }

    function updateParticles() {
        var px = par.x, py = par.y;
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += 0.006; p.life -= p.decay;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            ctx.fillStyle = 'rgba(255,255,255,' + (p.life * 0.55).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(p.x + px, p.y + py, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawPath() {
        if (!path.active || !path.nodes.length) return;
        var px = par.x, py = par.y;
        var len = path.nodes.length - 1;
        var head = path.p * len;
        ctx.save();
        // route line
        for (var i = 0; i < len; i++) {
            var seg = Math.max(0, Math.min(1, head - i));
            if (seg <= 0) continue;
            var a = vertices[path.nodes[i]], b = vertices[path.nodes[i + 1]];
            ctx.strokeStyle = 'rgba(240,110,60,' + (0.5 * path.alpha).toFixed(3) + ')';
            ctx.lineWidth = 1.6;
            ctx.shadowColor = 'rgba(240,90,30,0.6)';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(a.x + px, a.y + py);
            ctx.lineTo(a.x + (b.x - a.x) * seg + px, a.y + (b.y - a.y) * seg + py);
            ctx.stroke();
        }
        // nodes light up in sequence
        for (var n = 0; n < path.nodes.length; n++) {
            var np = Math.max(0, Math.min(1, head - (n - 0.5)));
            if (np <= 0) continue;
            var v = vertices[path.nodes[n]];
            ctx.fillStyle = 'rgba(255,255,255,' + (path.alpha * np).toFixed(3) + ')';
            ctx.shadowColor = 'rgba(240,120,70,0.9)';
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(v.x + px, v.y + py, 2.6 * np + 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawStatic() {
        ctx.clearRect(0, 0, w, h);
        drawEdges();
        drawDots();
    }

    // ---- Loop -----------------------------------------------------------
    var running = false, rafId = null;

    function updatePhysics() {
        for (var i = 0; i < vertices.length; i++) {
            var v = vertices[i];
            var tx = v.bx, ty = v.by;
            if (pointer.inside) {
                var dx = pointer.x - v.bx, dy = pointer.y - v.by;
                var d = Math.sqrt(dx * dx + dy * dy);
                if (d < RADIUS && d > 0.001) {
                    var f = 1 - d / RADIUS;
                    var disp = Math.min(MAX_DISP, f * MAX_DISP * 1.7);
                    tx = v.bx + (dx / d) * disp;
                    ty = v.by + (dy / d) * disp;
                }
            }
            v.vx += (tx - v.x) * STIFF; v.vx *= DAMP; v.x += v.vx;
            v.vy += (ty - v.y) * STIFF; v.vy *= DAMP; v.y += v.vy;
        }
    }

    function frame() {
        if (!running) return;
        // ease parallax
        par.x += (par.tx - par.x) * 0.06;
        par.y += (par.ty - par.y) * 0.06;
        updatePhysics();
        spawnParticles();
        ctx.clearRect(0, 0, w, h);
        drawEdges();
        drawPath();
        drawDots();
        updateParticles();
        // idle → occasionally fire a path
        if (pointer.inside && !path.active && (Date.now() - pointer.lastMove) > 1400) {
            pointer.lastMove = Date.now() + 4000; // debounce
            pickPath();
        }
        rafId = requestAnimationFrame(frame);
    }

    function start() {
        if (running || reduce || !fine) return;
        running = true;
        rafId = requestAnimationFrame(frame);
    }
    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    // ---- Pointer + light + parallax ------------------------------------
    var lightX = null, lightY = null;
    if (hasGsap && lightEl) {
        gsap.set(lightEl, { xPercent: -50, yPercent: -50 });
        lightX = gsap.quickTo(lightEl, 'x', { duration: 0.5, ease: 'power2.out' });
        lightY = gsap.quickTo(lightEl, 'y', { duration: 0.5, ease: 'power2.out' });
    }
    // Keywords follow the cursor on pointer devices; on touch/reduced-motion
    // they stay in the fixed centred spot (the CSS default).
    var wordPX = null, wordPY = null;
    var cursorWords = hasGsap && fine && keywordsEl;
    if (cursorWords) {
        keywordsEl.classList.add('is-cursor');
        gsap.set(keywordsEl, { xPercent: -50, yPercent: -50, opacity: 0 });
        wordPX = gsap.quickTo(keywordsEl, 'x', { duration: 0.55, ease: 'power3.out' });
        wordPY = gsap.quickTo(keywordsEl, 'y', { duration: 0.55, ease: 'power3.out' });
    }

    function onMove(e) {
        var r = section.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
        pointer.nx = pointer.x / w - 0.5;
        pointer.ny = pointer.y / h - 0.5;
        pointer.inside = true;
        pointer.lastMove = Date.now();
        par.tx = -pointer.nx * PARALLAX_MESH;
        par.ty = -pointer.ny * PARALLAX_MESH;
        if (lightX) { lightX(pointer.x); lightY(pointer.y); gsap.to(lightEl, { opacity: 1, duration: 0.6, overwrite: 'auto' }); }
        if (cursorWords) { wordPX(pointer.x); wordPY(pointer.y + 30); gsap.to(keywordsEl, { opacity: 1, duration: 0.4, overwrite: 'auto' }); }
    }
    function onLeave() {
        pointer.inside = false;
        par.tx = 0; par.ty = 0;
        if (hasGsap && lightEl) gsap.to(lightEl, { opacity: 0, duration: 0.6, overwrite: 'auto' });
        if (cursorWords) gsap.to(keywordsEl, { opacity: 0, duration: 0.5, overwrite: 'auto' });
    }
    if (fine) {
        section.addEventListener('mousemove', onMove);
        section.addEventListener('mouseleave', onLeave);
    }

    // ---- Keywords -------------------------------------------------------
    var wi = 0, wordTimer = null, WORD_MS = 2600;
    function nextWord() {
        wi = (wi + 1) % WORDS.length;
        if (!hasGsap) { wordEl.textContent = WORDS[wi]; return; }
        var tl = gsap.timeline();
        tl.to(wordEl, { y: -20, opacity: 0, filter: 'blur(7px)', duration: 0.4, ease: 'power2.in' })
          .add(function () { wordEl.textContent = WORDS[wi]; })
          .fromTo(wordEl, { y: 22, opacity: 0, filter: 'blur(7px)' }, { y: 0, opacity: WORD_ALPHA, filter: 'blur(0px)', duration: 0.55, ease: 'power2.out' });
    }
    function startWords(ms) {
        clearInterval(wordTimer);
        if (reduce) return; // reduced motion: keep the first word
        wordTimer = setInterval(nextWord, ms || WORD_MS);
    }
    if (hasGsap && wordEl) gsap.set(wordEl, { opacity: WORD_ALPHA });
    if (fine) {
        section.addEventListener('mouseenter', function () { startWords(1500); });
        section.addEventListener('mouseleave', function () { startWords(WORD_MS); });
    }

    // ---- Boot -----------------------------------------------------------
    resize();
    var rt;
    window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () { resize(); }, 180);
    });

    startWords(WORD_MS);

    if (reduce || !fine) {
        // static, cheap: one mesh draw, keywords cycle (unless reduced), no loop
        drawStatic();
    } else {
        // pause when offscreen or tab hidden
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                entries.forEach(function (en) { en.isIntersecting ? start() : stop(); });
            }, { threshold: 0.05 }).observe(section);
        } else {
            start();
        }
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) stop();
            else if (isOnscreen()) start();
        });
        schedulePath();
    }

    function isOnscreen() {
        var r = section.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
    }
})();
