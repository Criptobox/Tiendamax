"use strict";

function _cargarCarrito() {
    try {
        const raw = localStorage.getItem("carrito_v2");
        if (!raw) return [];
        const { items, expires } = JSON.parse(raw);
        return Date.now() > expires ? (localStorage.removeItem("carrito_v2"), []) : (items || []);
    } catch {
        return [];
    }
}

let carrito = _cargarCarrito();

function guardarCarrito() {
    const data = { items: carrito, expires: Date.now() + 864e5 };
    localStorage.setItem("carrito_v2", JSON.stringify(data));
    actualizarContadorCarrito();
}

function actualizarContadorCarrito() {
    const count = carrito.reduce((sum, item) => sum + item.cantidad, 0);
    const el = document.getElementById("cartCount");
    if (!el) return;
    if (count === 0) {
        el.style.display = "none";
    } else {
        el.style.display = "flex";
        el.textContent = count > 99 ? "99+" : count;
    }
}

let wishlist = JSON.parse(localStorage.getItem("wishlist_v1") || "[]").map(String);

function guardarWishlist() {
    localStorage.setItem("wishlist_v1", JSON.stringify(wishlist));
}

function toggleMeGusta(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    id = String(id);
    const idx = wishlist.indexOf(id);
    const added = idx === -1;
    if (added) {
        wishlist.push(id);
        mostrarNotificacion("❤️ Agregado a Me Gusta");
    } else {
        wishlist.splice(idx, 1);
        mostrarNotificacion("🤍 Eliminado de Me Gusta");
    }
    guardarWishlist();
    actualizarBadgeCorazon();
    document.querySelectorAll('[data-like-id="' + id + '"]').forEach(el => {
        el.classList.toggle("liked", wishlist.includes(id));
        el.setAttribute("aria-label", wishlist.includes(id) ? "Quitar me gusta" : "Me gusta");
        el.classList.remove("heart-pop");
        void el.offsetWidth; // trigger reflow
        el.classList.add("heart-pop");
    });
    if (added && event) flyToHeart(event);
}

function actualizarBadgeCorazon() {
    const countEl = document.getElementById("heartCount");
    const btn = document.getElementById("heartHeaderBtn");
    const icon = document.getElementById("heartHeaderIcon");
    if (!countEl) return;
    const count = wishlist.length;
    if (count === 0) {
        countEl.style.display = "none";
        if (icon) {
            icon.setAttribute("fill", "none");
            icon.style.color = "";
        }
    } else {
        countEl.style.display = "flex";
        countEl.textContent = count > 99 ? "99+" : count;
    }
}

function flyToHeart(e) {
    const heartBtn = document.getElementById("heartHeaderBtn");
    if (!heartBtn) return;
    const rect = e.target.getBoundingClientRect();
    const heartRect = heartBtn.getBoundingClientRect();
    const fly = document.createElement("div");
    fly.textContent = "❤️";
    fly.style.position = "fixed";
    fly.style.left = rect.left + "px";
    fly.style.top = rect.top + "px";
    fly.style.fontSize = "24px";
    fly.style.zIndex = "10000";
    fly.style.pointerEvents = "none";
    fly.style.transition = "all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    document.body.appendChild(fly);
    setTimeout(() => {
        fly.style.left = heartRect.left + "px";
        fly.style.top = heartRect.top + "px";
        fly.style.opacity = "0";
        fly.style.transform = "scale(2)";
    }, 10);
    setTimeout(() => fly.remove(), 600);
}

function agregarAlCarrito(id, qty = 1) {
    const item = productos.find(p => String(p.id) === String(id));
    if (!item) return;
    const existing = carrito.find(i => String(i.id) === String(id));
    if (existing) {
        existing.cantidad += qty;
    } else {
        carrito.push({ ...item, cantidad: qty });
    }
    guardarCarrito();
    mostrarNotificacion(`✅ ${item.nombre} agregado al carrito`);
}

function quitarDelCarrito(id) {
    carrito = carrito.filter(i => String(i.id) !== String(id));
    guardarCarrito();
    mostrarNotificacion("🗑️ Producto eliminado");
}

function cambiarCantidad(id, delta) {
    const item = carrito.find(i => String(i.id) === String(id));
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) {
        quitarDelCarrito(id);
    } else {
        guardarCarrito();
    }
}

function limpiarCarrito() {
    if (!confirm("¿Vaciar todo el carrito?")) return;
    carrito = [];
    guardarCarrito();
    mostrarNotificacion("🧹 Carrito vaciado");
}

function abrirCarrito() {
    document.getElementById("carritoDrawer").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    renderizarCarrito();
}

function cerrarCarrito() {
    document.getElementById("carritoDrawer").classList.add("hidden");
    document.body.style.overflow = "";
}

function renderizarCarrito() {
    const itemsCont = document.getElementById("carritoItems");
    const vacioCont = document.getElementById("carritoVacio");
    const footerCont = document.getElementById("carritoFooter");
    if (!itemsCont) return;

    if (carrito.length === 0) {
        vacioCont.style.display = "block";
        itemsCont.innerHTML = "";
        footerCont.style.display = "none";
        return;
    }

    vacioCont.style.display = "none";
    footerCont.style.display = "block";
    
    let html = "";
    let totalUSD = 0;
    carrito.forEach(item => {
        const subtotal = item.precio * item.cantidad;
        totalUSD += subtotal;
        html += `
            <div class="cart-item">
                <img src="${item.imagen}" alt="${item.nombre}" class="cart-item-img">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.nombre}</div>
                    <div class="cart-item-price">$${item.precio.toFixed(2)}</div>
                </div>
                <div class="cart-item-qty">
                    <button onclick="cambiarCantidad('${item.id}', -1)">-</button>
                    <span>${item.cantidad}</span>
                    <button onclick="cambiarCantidad('${item.id}', 1)">+</button>
                </div>
                <div class="cart-item-subtotal">$${subtotal.toFixed(2)}</div>
                <button onclick="quitarDelCarrito('${item.id}')" class="cart-item-remove">✕</button>
            </div>`;
    });
    itemsCont.innerHTML = html;
    
    const totalEl = document.getElementById("carritoTotal");
    if (totalEl) {
        const mon = localStorage.getItem("monedaActual") || "USD";
        if (mon === "USD") {
            totalEl.textContent = `$${totalUSD.toFixed(2)} USD`;
        } else {
            const tasa = parseFloat(localStorage.getItem("tasaMN") || "0") + 10;
            totalEl.textContent = `${(totalUSD * tasa).toFixed(0)} MN`;
        }
    }
}

function _mensajeOrdenWA(items) {
    let msg = "*🛒 NUEVO PEDIDO TiendaMax*\n\n";
    let totalUSD = 0;
    items.forEach((item, i) => {
        const sub = item.precio * item.cantidad;
        totalUSD += sub;
        msg += `${i + 1}. *${item.nombre}*\n   Cant: ${item.cantidad} | Sub: $${sub.toFixed(2)}\n\n`;
    });
    
    const mon = localStorage.getItem("monedaActual") || "USD";
    if (mon === "USD") {
        msg += `*TOTAL: $${totalUSD.toFixed(2)} USD*`;
    } else {
        const tasa = parseFloat(localStorage.getItem("tasaMN") || "0") + 10;
        msg += `*TOTAL: ${(totalUSD * tasa).toFixed(0)} MN*`;
    }
    return msg;
}

function comprarCarrito() {
    if (carrito.length === 0) return;
    const msg = _mensajeOrdenWA(carrito);
    const num = localStorage.getItem('whatsappNumero') || '5354320170';
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
}

function actualizarBotonesCarrito() {
    // No hace nada especial en esta versión, pero se mantiene por compatibilidad
}
