<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>My Maps Pro - Offline Ready</title>
    
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="apple-touch-icon" href="https://cdn-icons-png.flaticon.com/512/854/854878.png">

    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
    <link rel="stylesheet" href="https://unpkg.com/@raruto/leaflet-elevation/dist/leaflet-elevation.min.css" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet.locatecontrol/dist/L.Control.Locate.min.css" />
    
    <style>
        body, html { margin: 0; padding: 0; height: 100%; font-family: 'Segoe UI', sans-serif; overflow: hidden; background: #000; }
        #map { height: 100vh; width: 100%; z-index: 1; }
        #sidebar { position: absolute; top: 0; left: 0; width: 320px; height: 100%; background: white; z-index: 1000; transition: transform 0.3s ease; display: flex; flex-direction: column; }
        #sidebar.hidden { transform: translateX(-320px); }
        #toggle-btn { position: absolute; top: 20px; left: 330px; z-index: 1100; background: white; border: none; padding: 12px 18px; cursor: pointer; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: left 0.3s ease; font-size: 20px; }
        #sidebar.hidden + #toggle-btn { left: 20px; }
        .header { padding: 15px; background: #007bff; color: white; padding-top: 45px; }
        .track-item { padding: 12px; display: flex; align-items: center; border-bottom: 1px solid #eee; gap: 10px; }
        .track-clickable { cursor: pointer; flex-grow: 1; overflow: hidden; }
        .track-name { font-weight: 600; font-size: 13px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        /* Индикатор оффлайна */
        .offline-badge { font-size: 9px; padding: 2px 5px; border-radius: 4px; background: #eee; color: #999; text-transform: uppercase; }
        .offline-ready { background: #d4edda; color: #155724; font-weight: bold; }

        .btn-action { width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #6c757d; color: white; }
        .leaflet-control-share { background: white; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 4px; box-shadow: 0 1px 5px rgba(0,0,0,0.4); font-size: 18px; }
        .leaflet-bottom.leaflet-right { margin-bottom: 25px; margin-right: 10px; }
    </style>
</head>
<body>

    <div id="sidebar">
        <div class="header">
            <h3 style="margin:0; font-size: 16px;">📍 Offline Tracks</h3>
            <div id="stat-dist" style="font-size: 11px; opacity: 0.8;">Caricamento...</div>
        </div>
        <div id="track-list" style="overflow-y: auto; flex-grow: 1;"></div>
    </div>

    <button id="toggle-btn" onclick="toggleSidebar()">☰</button>
    <div id="map"></div>

    <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/gpx.min.js"></script>
    <script src="https://unpkg.com/d3@5.16.0/dist/d3.min.js"></script>
    <script src="https://unpkg.com/@raruto/leaflet-elevation/dist/leaflet-elevation.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/leaflet.locatecontrol/dist/L.Control.Locate.min.js"></script>

    <script>
        const user = 'mi-bot-500', repo = 'my-maps', folder = 'tracks';
        const map = L.map('map', { center: [45.46, 9.19], zoom: 7, zoomControl: false });
        L.tileLayer('http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map);

        const elevationControl = L.control.elevation({ position: "bottomright", theme: "skyblue-theme", detached: false }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.control.locate({ position: 'bottomright', flyTo: true }).addTo(map);

        // Кнопка Share
        const ShareControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: function() {
                const c = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-share');
                c.innerHTML = '📤';
                c.onclick = () => {
                    const url = `https://www.google.com/maps?q=${map.getCenter().lat},${map.getCenter().lng}`;
                    if (navigator.share) navigator.share({ title: 'Location', url: url });
                    else alert("Link: " + url);
                };
                return c;
            }
        });
        map.addControl(new ShareControl());

        window.tracksData = {};

        async function isCached(url) {
            if (!('caches' in window)) return false;
            const cache = await caches.open('my-tracks-v2');
            const match = await cache.match(url);
            return !!match;
        }

        async function loadAllTracks() {
            const response = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/${folder}`);
            const files = await response.json();
            const gpxFiles = files.filter(f => f.name.toLowerCase().endsWith('.gpx'));
            
            const list = document.getElementById('track-list');
            for (const file of gpxFiles) {
                const cached = await isCached(file.download_url);
                const color = '#007bff';
                const id = Math.random().toString(36).substr(2, 9);
                
                const item = document.createElement('div');
                item.className = 'track-item';
                item.innerHTML = `
                    <div class="track-clickable" onclick="focusTrack('${id}', '${file.download_url}', this)">
                        <span class="track-name">${file.name.replace('.gpx','')}</span>
                        <span class="offline-badge ${cached ? 'offline-ready' : ''}">${cached ? '✅ Ready' : 'Cloud'}</span>
                    </div>
                    <button class="btn-action" onclick="toggleVisibility('${id}')">👁</button>
                `;
                list.appendChild(item);

                const gpx = new L.GPX(file.download_url, { async: true, polyline_options: { color: color, weight: 4 } })
                .on('loaded', e => { window.tracksData[id] = e.target; })
                .addTo(map);
            }
        }

        function focusTrack(id, url, element) {
            const t = window.tracksData[id];
            if (t) {
                map.fitBounds(t.getBounds());
                elevationControl.load(url);
                // После загрузки помечаем как готовый
                const badge = element.querySelector('.offline-badge');
                badge.innerText = '✅ Ready';
                badge.classList.add('offline-ready');
            }
        }

        function toggleVisibility(id) {
            const t = window.tracksData[id];
            if (map.hasLayer(t)) map.removeLayer(t); else map.addLayer(t);
        }

        function toggleSidebar() { document.getElementById('sidebar').classList.toggle('hidden'); setTimeout(() => map.invalidateSize(), 350); }

        loadAllTracks();

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js');
        }
    </script>
</body>
</html>
