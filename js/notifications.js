"use strict";

async function solicitarNotificaciones() {
    if (!('Notification' in window)) {
        mostrarNotificacion('Tú navegador no soporta notificaciones', 'error');
        return;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
}

function mostrarNotificacionPush(titulo, cuerpo, icono = '/favicon.svg') {
    if (Notification.permission === 'granted') {
        new Notification(titulo, { body: cuerpo, icon: icono });
    }
}

async function registrarTokenFCM() {
    try {
        const configRaw = localStorage.getItem('firebaseConfig');
        if (!configRaw) throw new Error('Falta configuración de Firebase');
        const config = JSON.parse(configRaw);
        
        const vapidKey = config.vapidKey || localStorage.getItem('firebaseVapidKey');
        const reg = await navigator.serviceWorker.ready;
        const token = await messaging.getToken({ vapidKey: vapidKey, serviceWorkerRegistration: reg });
        
        if (!token) throw new Error('No se pudo obtener token');

        const tokenId = btoa(token).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        const rtdbUrl = config.databaseURL;

        await fetch(`${rtdbUrl}/tokens/${tokenId}.json`, {
            method: 'PUT',
            body: JSON.stringify({ token: token, timestamp: Date.now(), userAgent: navigator.userAgent })
        });

        localStorage.setItem('fcmToken', token);
        return true;
    } catch (e) {
        console.error('FCM registration error:', e);
        return false;
    }
}
