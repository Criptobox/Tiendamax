/* banners.js - Slider de banners y gestion desde admin. Expone: irBanner, moverBanner, agregarBanner, editarBanner, cancelarEdicionBanner, guardarEdicionBanner, eliminarBanner, guardarTagline, recargarBanners, exportarBannersJSON */

(function() {
    function _lsGet(key) { try { return localStorage.getItem(key); } catch(e) { return null; } }
    function _lsSet(key, val) { try { localStorage.setItem(key, val); } catch(e) {} }


    var DEFAULT_BANNERS = [
        "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=900&q=80&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&q=80&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=900&q=80&auto=format&fit=crop"
    ];

    var bannersGuardados = JSON.parse(_lsGet('heroBanners') || 'null');
    var banners = bannersGuardados || [];
    var sliderListo = !!bannersGuardados;
    var current = 0;
    var timer = null;


    function renderSlider() {
        var track = document.getElementById('heroBannerTrack');
        var dots  = document.getElementById('heroBannerDots');
        if (!track || !dots) return;
        // Construir slides con DOM seguro (no innerHTML con datos crudos)
        while (track.firstChild) track.removeChild(track.firstChild);
        banners.forEach(function(b, i) {
            var url  = typeof b === 'string' ? b : (b && b.url) || '';
            var link = typeof b === 'string' ? '' : (b && b.link) || '';
            // Solo aceptamos http(s) o data: para src
            if (!/^(https?:|data:)/i.test(url)) url = '';

            var slide = document.createElement('div');
            slide.className = 'hero-banner-slide';
            slide.style.position = 'relative';
            if (link && /^https?:/i.test(link)) {
                slide.style.cursor = 'pointer';
                slide.setAttribute('data-banner-link', link);
                slide.addEventListener('click', function() {
                    window.open(link, '_blank', 'noopener,noreferrer');
                });
            }

            // Fondo borroso: misma imagen borrosa rellena las barras laterales.
            // La foto NO se pone aquí: la pone _cargarSlide cuando toca (ver
            // abajo). Un background-image de CSS no es lazy, así que con la url
            // puesta de entrada se bajaban los tres banners al abrir la página,
            // aunque el cliente nunca bajara hasta ellos.
            var bgBlur = document.createElement('div');
            bgBlur.setAttribute('aria-hidden', 'true');
            bgBlur.className = 'hb-blur';
            bgBlur.style.cssText = 'position:absolute;inset:-5%;background-size:cover;background-position:center;filter:blur(14px) brightness(0.6);z-index:0;pointer-events:none;';
            slide.appendChild(bgBlur);
            slide.setAttribute('data-src', url);

            var img = document.createElement('img');
            img.alt = 'Banner TiendaMax';
            img.decoding = 'async';
            img.style.cssText = 'position:relative;z-index:1;width:100%;height:100%;object-fit:contain;object-position:center;display:block;pointer-events:none;';
            img.onerror = function() { slide.style.background = '#1a1a1a'; };
            slide.appendChild(img);

            if (slide.hasAttribute('data-banner-link')) {
                var p = document.createElement('span');
                p.textContent = '⭐ Patrocinado';
                p.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px;z-index:2;';
                slide.appendChild(p);
            }

            track.appendChild(slide);
        });

        while (dots.firstChild) dots.removeChild(dots.firstChild);
        banners.forEach(function(_, i) {
            var d = document.createElement('div');
            d.className = 'hero-banner-dot' + (i === 0 ? ' active' : '');
            d.addEventListener('click', function() { window.irBanner(i); });
            dots.appendChild(d);
        });

        _enVista = false;
        window.irBanner(0);
        startAutoPlay();
        _vigilar(track);
    }

    /* Carga la foto de un slide (img + fondo borroso), una sola vez. */
    function _cargarSlide(i) {
        var track = document.getElementById('heroBannerTrack');
        if (!track || !track.children.length) return;
        var slide = track.children[(i + track.children.length) % track.children.length];
        if (!slide || slide.getAttribute('data-cargado')) return;
        var url = slide.getAttribute('data-src');
        if (!url) return;
        slide.setAttribute('data-cargado', '1');
        var img = slide.querySelector('img');
        if (img) img.src = url;
        var bg = slide.querySelector('.hb-blur');
        if (bg) bg.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
    }

    /* Solo cuando el carrusel se acerca a la pantalla: el que se ve y el
       siguiente. Los demás, al llegarles el turno. Sin IntersectionObserver,
       se cargan como antes. */
    var _enVista = false, _obs = null;
    function _vigilar(track) {
        if (_obs) _obs.disconnect();
        if (!('IntersectionObserver' in window)) {
            _enVista = true;
            for (var i = 0; i < banners.length; i++) _cargarSlide(i);
            return;
        }
        _obs = new IntersectionObserver(function(es) {
            _enVista = es[0].isIntersecting;
            if (_enVista) { _cargarSlide(current); _cargarSlide(current + 1); }
        }, { rootMargin: '300px 0px' });
        _obs.observe(track.parentElement || track);
    }

    window.irBanner = function(idx) {
        if (banners.length === 0) return;
        current = (idx + banners.length) % banners.length;
        var track = document.getElementById('heroBannerTrack');
        if (track) track.style.transform = 'translateX(-' + (current * 100) + '%)';
        if (_enVista) { _cargarSlide(current); _cargarSlide(current + 1); }
        document.querySelectorAll('.hero-banner-dot').forEach(function(d, i) {
            d.classList.toggle('active', i === current);
        });
    };

    window.moverBanner = function(dir) {
        window.irBanner(current + dir);
        resetAutoPlay();
    };

    function startAutoPlay() {
        clearInterval(timer);
        if (banners.length > 1) {
            // Sin girar mientras no se ve: cada vuelta puede ser una foto nueva.
            timer = setInterval(function() {
                if (!_enVista || document.hidden) return;
                irBanner(current + 1);
            }, 8000);
        }
    }

    function resetAutoPlay() {
        clearInterval(timer);
        startAutoPlay();
    }

    function cargarTagline() {
        var t = _lsGet('heroTagline');
        if (t && !t.includes('Inversores') && !t.includes('WiFi') && !t.includes('Tecnología')) {
            var el = document.getElementById('heroTaglineText');
            if (el) el.textContent = t;
        }
    }


    window.recargarBanners = function(nuevos) {
        if (nuevos && nuevos.length > 0) {
            banners = nuevos;
            _lsSet('heroBanners', JSON.stringify(banners));
        } else if (banners.length === 0) {
            banners = DEFAULT_BANNERS;
        }
        renderSlider();
    };


    document.addEventListener('DOMContentLoaded', function() {
        if (sliderListo) renderSlider();
        cargarTagline();
        setTimeout(function() {
            if (banners.length === 0) {
                banners = DEFAULT_BANNERS;
                renderSlider();
            }
        }, 5000);
    });
})();