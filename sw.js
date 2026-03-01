<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>My Maps Pro - Ultimate</title>
    
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="apple-touch-icon" href="https://cdn-icons-png.flaticon.com/512/854/854878.png">

    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
    <link rel="stylesheet" href="https://unpkg.com/@raruto/leaflet-elevation/dist/leaflet-elevation.min.css" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet.locatecontrol/dist/L.Control.Locate.min.css" />
    
    <style>
        body, html { margin: 0; padding: 0; height: 100%; font-family: 'Segoe UI', sans-serif; overflow: hidden; background: #000; }
        #map { height: 100vh; width: 100%; z-index: 1; background: #f0f0f0; }
        
        #sidebar { 
            position: absolute; top: 0; left: 0; width: 330px; height: 100%; 
            background: white; z-index: 1000; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
            box-shadow: 2px 0 10px rgba(0,0,0,0.2); display: flex; flex-direction: column;
            touch-action: pan-y;
        }
        #sidebar.hidden { transform: translateX(-330px); }
        
        #toggle-btn { 
            position: absolute; top: 20px; left: 340px; z-index: 1100; 
            background: white; border: none; padding: 12px 18px; cursor: pointer; 
            border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); 
            transition: left 0.3s ease; font-size: 20px;
        }
        #sidebar.hidden + #toggle-btn { left: 20px; }

        .header { padding: 15px; background: #007bff; color: white; padding-top: 40px; }
        .stats { font-size: 11px; opacity: 0.9; margin-top: 5px; display: flex; gap: 10px; }
        
        .month-group { background: #f1f3f5; padding: 6px 15px; font-size: 11px; font-weight: bold; color: #666; text-transform: uppercase; border-bottom: 1px solid #ddd; position: sticky; top: 0; z-index: 10; }
        
        #track-list { overflow-y: auto; flex-grow: 1; }
        .track-item { padding: 10px 15px; display: flex; align-items: center; border-bottom: 1px solid #eee; gap: 8px; justify-content: space-between; background: #fff; }
        .track-clickable { cursor: pointer; flex-grow: 1; overflow: hidden; }
        .track-name { font-weight: 600; font-size: 13px; color: #333; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .track-dist-label { font-size: 10px; color: #888; }
        
        .offline-badge { font-size: 9px; padding: 2px 4px; border-radius: 3px; background: #f0f0f0; color: #999; margin-left: 5px; }
        .offline-ready { background: #d4edda; color: #155724; }

        .btn-action { width: 32px; height: 32px; border: 1px solid #eee; background: #f9f9f9; cursor: pointer; border-radius: 4px; }
        .hidden-track { opacity: 0.4; background: #ffdada; }

        .point-data-tooltip { background: rgba(0,0,0,0.85) !important; color: #fff !important; border: none !important; box-shadow: none !important; font-size: 11px; padding: 4px 8px; border-radius: 4px; }
    </style>
</head>
<body>

    <div id="sidebar" class="hidden">
        <div class="header">
            <h3 style="margin:0; font-size: 16px;">📍 MyTracks Pro</h3>
            <div class="stats">
                <span id="stat-count">Tracce: 0</span>
                <span id="stat-dist">Totale: 0 km</span>
            </div>
        </div>
        <div id="track-list"></div>
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

        const elevationControl = L.control.elevation({ position: "bottomright", theme: "skyblue-theme", detached: false, elevationData: "ele" }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.control.locate({ position: 'bottomright', flyTo: true }).addTo(map);

        window.tracksData = {};
        let totalDistance = 0;

        // Поиск ближайшей точки для тултипа времени
        function findNearestPoint(layer, latlng) {
            let coords = layer.get_coords();
            let nearest = null;
            let minDist = Infinity;
            coords.forEach(p => {
                let d = latlng.distanceTo(L.latLng(p.lat, p.lng));
                if (d < minDist) { minDist = d; nearest = p; }
            });
            return nearest;
        }

        async function loadAllTracks() {
            try {
                const response = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/${folder}`);
                const files = await response.json();
                const gpxFiles = files.filter(f => f.name.toLowerCase().endsWith('.gpx'));

                // Получаем даты для группировки (через commits API для точности)
                const data = await Promise.all(gpxFiles.map(async f => {
                    const cResp = await fetch(`https://api.github.com/repos/${user}/${repo}/commits?path=${f.path}&per_page=1`);
                    const cData = await cResp.json();
                    return { ...f, date: new Date(cData[0].commit.committer.date) };
                }));

                data.sort((a, b) => b.date - a.date);

                const list = document.getElementById('track-list');
                let currentMonth = "";
                let firstId = null;
                let firstUrl = null;

                for (const file of data) {
                    const monthStr = file.date.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
                    if (monthStr !== currentMonth) {
                        currentMonth = monthStr;
                        const h = document.createElement('div'); h.className = 'month-group'; h.innerText = monthStr;
                        list.appendChild(h);
                    }

                    const color = ['#FF5733', '#28a745', '#007bff', '#F333FF', '#E67E22'][Math.floor(Math.random()*5)];
                    const id = Math.random().toString(36).substr(2, 9);
                    
                    const item = document.createElement('div');
                    item.className = 'track-item';
                    item.id = `item-${id}`;
                    item.innerHTML = `
                        <div class="track-clickable" onclick="focusTrack('${id}', '${file.download_url}', this)">
                            <span class="track-name" style="color:${color}">${file.name.replace('.gpx','')}</span>
                            <span class="track-dist-label" id="dist-${id}">... km</span>
                            <span class="offline-badge" id="badge-${id}">Cloud</span>
                        </div>
                        <button class="btn-action" onclick="toggleVisibility('${id}')">👁</button>
                    `;
                    list.appendChild(item);

                    const gpx = new L.GPX(file.download_url, {
                        async: true,
                        polyline_options: { color: color, weight: 5, opacity: 0.7 },
                        marker_options: { startIconUrl: '', endIconUrl: '', shadowUrl: '' }
                    }).on('loaded', e => {
                        const l = e.target;
                        const d = l.get_distance() / 1000;
                        window.tracksData[id] = l;
                        totalDistance += d;
                        document.getElementById(`dist-${id}`).innerText = `${d.toFixed(1)} km`;
                        updateStats();

                        // Тултипы
                        l.bindTooltip(`${file.name.replace('.gpx','')}`, { sticky: true });
                        
                        l.on('mousemove', function(ev) {
                            const p = findNearestPoint(l, ev.latlng);
                            if (p && p.meta.time) {
                                const t = new Date(p.meta.time).toLocaleTimeString('it-IT');
                                const ele = p.meta.ele ? ` | ${Math.round(p.meta.ele)}m` : '';
                                L.popup({ closeButton: false, className: 'point-data-tooltip' })
                                    .setLatLng(ev.latlng).setContent(t + ele).openOn(map);
                            }
                        });
                        l.on('mouseout', () => map.closePopup());

                        if (!firstId) { firstId = id; firstUrl = file.download_url; }
                    }).addTo(map);
                }

                // Автофокус на самый первый (последний загруженный)
                setTimeout(() => { if(firstId) focusTrack(firstId, firstUrl, document.getElementById(`item-${firstId}`)); }, 1200);

            } catch (e) { console.error(e); }
        }

        function updateStats() {
            document.getElementById('stat-count').innerText = `Tracce: ${Object.keys(window.tracksData).length}`;
            document.getElementById('stat-dist').innerText = `Totale: ${totalDistance.toFixed(1)} km`;
        }

        function focusTrack(id, url, el) {
            const t = window.tracksData[id];
            if (t) {
                map.fitBounds(t.getBounds(), { padding: [50, 50] });
                elevationControl.clear();
                elevationControl.load(url);
                const b = document.getElementById(`badge-${id}`);
                if (b) { b.innerText = '✅ Ready'; b.classList.add('offline-ready'); }
            }
        }

        function toggleVisibility(id) {
            const t = window.tracksData[id];
            const btn = document.querySelector(`#item-${id} .btn-action`);
            if (map.hasLayer(t)) { map.removeLayer(t); btn.classList.add('hidden-track'); }
            else { map.addLayer(t); btn.classList.remove('hidden-track'); }
        }

        function toggleSidebar() { 
            document.getElementById('sidebar').classList.toggle('hidden'); 
            setTimeout(() => map.invalidateSize(), 350); 
        }

        // Swipe logic
        let ts;
        document.addEventListener('touchstart', e => ts = e.touches[0].clientX);
        document.addEventListener('touchend', e => {
            const te = e.changedTouches[0].clientX;
            if (ts < 50 && te - ts > 100) document.getElementById('sidebar').classList.remove('hidden');
        });

        loadAllTracks();
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
    </script>
</body>
</html>
