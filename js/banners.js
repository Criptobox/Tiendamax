/* banners.js - Slider de banners y gestion desde admin. Expone: irBanner, moverBanner, agregarBanner, editarBanner, cancelarEdicionBanner, guardarEdicionBanner, eliminarBanner, guardarTagline, recargarBanners, exportarBannersJSON */

(function() {
    var DEFAULT_BANNERS = [
        "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=900&q=80&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&q=80&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=900&q=80&auto=format&fit=crop"
    ];

    var bannersGuardados = JSON.parse(localStorage.getItem('heroBanners') || 'null');
    var banners = bannersGuardados || [];
    var sliderListo = !!bannersGuardados;
    var current = 0;
    var timer = null;

    // Helper local para escapar atributos/HTML
    function _escA(s) {
        return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

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

            var img = document.createElement('img');
            img.src = url;
            img.alt = 'Banner TiendaMax';
            img.loading = 'lazy';
            img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;';
            img.onerror = function() { slide.style.background = '#1a1a1a'; };
            slide.appendChild(img);

            if (slide.hasAttribute('data-banner-link')) {
                var p = document.createElement('span');
                p.textContent = '⭐ Patrocinado';
                p.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px;';
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

        irBanner(0);
        startAutoPlay();
    }

    window.irBanner = function(idx) {
        if (banners.length === 0) return;
        current = (idx + banners.length) % banners.length;
        var track = document.getElementById('heroBannerTrack');
        if (track) track.style.transform = 'translateX(-' + (current * 100) + '%)';
        document.querySelectorAll('.hero-banner-dot').forEach(function(d, i) {
            d.classList.toggle('active', i === current);
        });
    };

    window.moverBanner = function(dir) {
        irBanner(current + dir);
        resetAutoPlay();
    };

    function startAutoPlay() {
        clearInterval(timer);
        if (banners.length > 1) {
            timer = setInterval(function() { irBanner(current + 1); }, 8000);
        }
    }

    function resetAutoPlay() {
        clearInterval(timer);
        startAutoPlay();
    }

    function cargarTagline() {
        var t = localStorage.getItem('heroTagline');
        if (t && !t.includes('Inversores') && !t.includes('WiFi') && !t.includes('Tecnología')) {
            var el = document.getElementById('heroTaglineText');
            if (el) el.textContent = t;
        }
    }

    window.guardarTagline = function() {
        var val = document.getElementById('heroTaglineInput').value.trim();
        if (!val) return;
        localStorage.setItem('heroTagline', val);
        var el = document.getElementById('heroTaglineText');
        if (el) el.textContent = val;
        if (typeof mostrarNotificacion === 'function') mostrarNotificacion('✅ Texto guardado');
    };

    window.agregarBanner = async function() {
        var fileInput = document.getElementById('nuevoBannerFile');
        var urlInput  = document.getElementById('nuevoBannerUrl');
        var link      = document.getElementById('nuevoBannerLink').value.trim();

        function guardarYRenderizar(url) {
            banners.unshift({ url: url, link: link });
            localStorage.setItem('heroBanners', JSON.stringify(banners));
            fileInput.value = '';
            urlInput.value = '';
            document.getElementById('nuevoBannerLink').value = '';
            renderSlider();
            renderAdminBannerList();
            if (typeof mostrarNotificacion === 'function') mostrarNotificacion('✅ Banner agregado');
        }

        if (fileInput.files && fileInput.files[0]) {
            if (typeof mostrarNotificacion === 'function') mostrarNotificacion('⏳ Comprimiendo imagen...');
            try {
                var comprimida = await comprimirImagen(fileInput.files[0], 150, 1200, 600);
                guardarYRenderizar(comprimida);
            } catch(e) {
                var reader = new FileReader();
                reader.onload = function(ev) { guardarYRenderizar(ev.target.result); };
                reader.readAsDataURL(fileInput.files[0]);
            }
        } else {
            var url = urlInput.value.trim();
            if (!url) { if (typeof mostrarNotificacion === 'function') mostrarNotificacion('⚠️ Selecciona una imagen o pega una URL', 'error'); return; }
            guardarYRenderizar(url);
        }
    };

    window.editarBanner = function(idx) {
        var el = document.getElementById('banner-edit-' + idx);
        if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
    };

    window.cancelarEdicionBanner = function(idx) {
        var el = document.getElementById('banner-edit-' + idx);
        if (el) el.style.display = 'none';
    };

    window.guardarEdicionBanner = async function(idx) {
        var linkInput = document.getElementById('banner-edit-link-' + idx);
        var fileInput = document.getElementById('banner-edit-file-' + idx);
        var newLink   = linkInput ? linkInput.value.trim() : '';

        function aplicar(newUrl) {
            if (typeof banners[idx] === 'string') banners[idx] = { url: banners[idx], link: '' };
            if (newUrl) banners[idx].url = newUrl;
            banners[idx].link = newLink;
            localStorage.setItem('heroBanners', JSON.stringify(banners));
            renderSlider();
            renderAdminBannerList();
            if (typeof mostrarNotificacion === 'function') mostrarNotificacion('✅ Banner actualizado');
        }

        if (fileInput && fileInput.files && fileInput.files[0]) {
            if (typeof mostrarNotificacion === 'function') mostrarNotificacion('⏳ Comprimiendo imagen...');
            try {
                var comprimida = await comprimirImagen(fileInput.files[0], 150, 1200, 600);
                aplicar(comprimida);
            } catch(e) {
                var reader = new FileReader();
                reader.onload = function(ev) { aplicar(ev.target.result); };
                reader.readAsDataURL(fileInput.files[0]);
            }
        } else {
            aplicar(null);
        }
    };

    window.eliminarBanner = function(idx) {
        banners.splice(idx, 1);
        localStorage.setItem('heroBanners', JSON.stringify(banners));
        renderSlider();
        renderAdminBannerList();
    };

    function renderAdminBannerList() {
        var list = document.getElementById('bannerList');
        if (!list) return;
        if (banners.length === 0) {
            list.innerHTML = '<p style="font-size:12px;color:#aaa;">No hay banners. Agrega uno abajo.</p>';
            return;
        }
        list.innerHTML = banners.map(function(b, i) {
            var url  = typeof b === 'string' ? b : b.url;
            var link = typeof b === 'string' ? '' : (b.link || '');
            var urlSafe  = _escA(url);
            var linkSafe = _escA(link);
            var urlThumb = url.length > 200 ? _escA(url.substring(0,50)) + '...' : urlSafe;
            return '<div id="banner-item-' + i + '" style="display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,0.05);padding:10px;border-radius:8px;">' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                    '<img src="' + urlSafe + '" style="width:60px;height:40px;object-fit:contain;border-radius:6px;flex-shrink:0;">' +
                    '<div style="flex:1;min-width:0;">' +
                        '<div style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">Banner ' + (i+1) + '</div>' +
                        (link ? '<div style="font-size:10px;color:#25D366;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🔗 ' + linkSafe + '</div>' : '<div style="font-size:10px;color:#aaa;">Sin link</div>') +
                    '</div>' +
                    '<button onclick="editarBanner(' + i + ')" type="button" style="background:#3498db;color:white;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;flex-shrink:0;">✏️</button>' +
                    '<button onclick="eliminarBanner(' + i + ')" type="button" style="background:#e74c3c;color:white;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;flex-shrink:0;">🗑️</button>' +
                '</div>' +
                '<div id="banner-edit-' + i + '" style="display:none;flex-direction:column;gap:6px;padding-top:6px;border-top:1px solid rgba(0,0,0,0.1);">' +
                    '<input type="file" id="banner-edit-file-' + i + '" accept="image/*" style="font-size:12px;">' +
                    '<input type="url" id="banner-edit-link-' + i + '" value="' + linkSafe + '" placeholder="Link al tocar (WhatsApp, etc.)" style="font-size:12px;">' +
                    '<div style="display:flex;gap:6px;">' +
                        '<button onclick="guardarEdicionBanner(' + i + ')" type="button" style="flex:1;background:#27ae60;color:white;border:none;border-radius:6px;padding:6px;cursor:pointer;font-size:12px;">💾 Guardar</button>' +
                        '<button onclick="cancelarEdicionBanner(' + i + ')" type="button" style="background:#888;color:white;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;">✕</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        var taglineInput = document.getElementById('heroTaglineInput');
        if (taglineInput) {
            var saved = localStorage.getItem('heroTagline');
            if (saved) taglineInput.value = saved;
        }
    }

    window.recargarBanners = function(nuevos) {
        if (nuevos && nuevos.length > 0) {
            banners = nuevos;
            localStorage.setItem('heroBanners', JSON.stringify(banners));
        } else if (banners.length === 0) {
            banners = DEFAULT_BANNERS;
        }
        renderSlider();
        renderAdminBannerList();
    };

    window.exportarBannersJSON = function() {
        var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(banners, null, 2));
        var a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', 'banners.json');
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (typeof mostrarNotificacion === 'function') mostrarNotificacion('✅ banners.json descargado. Súbelo a GitHub.');
    };

    document.addEventListener('DOMContentLoaded', function() {
        if (sliderListo) renderSlider();
        cargarTagline();
        document.addEventListener('click', function(e) {
            if (e.target && e.target.dataset && e.target.dataset.tab === 'apariencia') {
                setTimeout(renderAdminBannerList, 100);
            }
        });
        setTimeout(function() {
            if (banners.length === 0) {
                banners = DEFAULT_BANNERS;
                renderSlider();
            }
        }, 5000);
    });
})();