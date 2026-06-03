"use strict";

async function subirArchivoAGitHub(user, repo, token, path, content) {
    const url = `https://api.github.com/repos/${user}/${repo}/contents/${path}`;
    
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `token ${token}` }
        });
        
        let sha = null;
        if (res.ok) {
            const data = await res.json();
            sha = data.sha;
        }

        const body = {
            message: 'Update ' + path + ' via TiendaMax Admin',
            content: typeof content === 'string' ? btoa(unescape(encodeURIComponent(content))) : btoa(JSON.stringify(content, null, 2)),
            sha: sha
        };

        const putRes = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!putRes.ok) throw new Error('Error updating file on GitHub');
        return true;
    } catch (e) {
        console.error('GitHub upload error:', e);
        throw e;
    }
}

async function descargarConfigGitHub(user, repo) {
    const url = `https://raw.githubusercontent.com/${user}/${repo}/main/config.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Could not fetch config from GitHub');
    return await res.json();
}
