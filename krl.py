"""Build krl.json: {station_id: [lat, lon, name]} for KRL stations.

Station list comes from api.comuline.com, coordinates from OpenStreetMap (Overpass).
Usage: python3 krl.py   (re-run when stations change)
"""
import json, re, subprocess, time

UA = 'transum/0.1 (local app)'
# Jabodetabek + Banten. ponytail: Yogya-Solo line is outside this box, widen it if needed.
QUERY = '[out:json][timeout:60];nwr["railway"~"^(station|halt)$"](-6.75,105.8,-5.9,107.4);out center;'


def fetch(url, data=None):
    # curl, not urllib: macOS system Python's LibreSSL fails the TLS handshake with Overpass.
    cmd = ['curl', '-sf', '-m', '90', '-A', UA, url] + (['--data-urlencode', 'data=' + data] if data else [])
    for attempt in range(4):
        try:
            return json.loads(subprocess.run(cmd, capture_output=True, check=True).stdout)
        except (subprocess.CalledProcessError, ValueError):  # Overpass returns an HTML error page when busy
            if attempt == 3:
                raise
            time.sleep(20)


def norm(name):
    return re.sub(r'[^A-Z]', '', name.upper().replace('STASIUN', ''))


def build(osm, stations):
    index = {}
    for el in osm:
        tags = el.get('tags', {})
        if not re.search('KAI|KERETA', (tags.get('network', '') + tags.get('operator', '')).upper()):
            continue  # skip MRT/LRT stations
        ll = (el.get('lat') or el['center']['lat'], el.get('lon') or el['center']['lon'])
        for key in ('railway:ref', 'ref'):
            if tags.get(key):
                index.setdefault('#' + tags[key], ll)
        for key in ('name', 'alt_name', 'official_name', 'old_name'):
            if tags.get(key):
                index.setdefault(norm(tags[key]), ll)
    out = {}
    for s in stations:
        ll = index.get('#' + s['id']) or index.get(norm(s['name']))
        if s['type'] == 'KRL' and ll:
            out[s['id']] = [round(ll[0], 5), round(ll[1], 5), s['name']]
    return out


if __name__ == '__main__':
    osm = fetch('https://overpass-api.de/api/interpreter', QUERY)['elements']
    stations = fetch('https://api.comuline.com/v1/station')['data']
    out = build(osm, stations)
    assert 'MRI' in out and len(out) > 80, f'only {len(out)} stations matched'
    with open('krl.json', 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(len(out), 'stations written to krl.json')
