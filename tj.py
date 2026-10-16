"""Build tj.json (compact TransJakarta schedule) from the official GTFS feed.

Usage: python3 tj.py   (re-run when TransJakarta publishes a new feed)
"""
import csv, io, json, urllib.request, zipfile

URL = 'https://gtfs.transjakarta.co.id/files/file_gtfs.zip'


def secs(hms):
    h, m, s = map(int, hms.split(':'))
    return h * 3600 + m * 60 + s


def build(z):
    read = lambda name: list(csv.DictReader(io.TextIOWrapper(z.open(name), 'utf-8-sig')))
    days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    cal = {c['service_id']: [int(c[d]) for d in days] for c in read('calendar.txt')}
    stops = {s['stop_id']: (round(float(s['stop_lat']), 5), round(float(s['stop_lon']), 5), s['stop_name'])
             for s in read('stops.txt')}
    routes = {r['route_id']: r for r in read('routes.txt')}
    times = {}
    for st in read('stop_times.txt'):
        times.setdefault(st['trip_id'], []).append(st)
    freqs = {}
    for f in read('frequencies.txt'):
        freqs.setdefault(f['trip_id'], []).append([secs(f['start_time']), secs(f['end_time']), int(f['headway_secs'])])

    trips = []
    for t in read('trips.txt'):
        st = sorted(times.get(t['trip_id'], []), key=lambda s: int(s['stop_sequence']))
        if len(st) < 2 or t['trip_id'] not in freqs:
            continue
        t0 = secs(st[0]['departure_time'])
        r = routes[t['route_id']]
        trips.append({
            'r': r['route_short_name'], 'n': r['route_long_name'], 'c': '#' + (r['route_color'] or '888888'),
            'h': t['trip_headsign'], 'd': cal.get(t['service_id'], [1] * 7),
            # [lat, lon, seconds after trip start, stop name]
            's': [[*stops[s['stop_id']][:2], secs(s['departure_time']) - t0, stops[s['stop_id']][2]] for s in st],
            'f': freqs[t['trip_id']],
        })
    return trips


if __name__ == '__main__':
    with urllib.request.urlopen(URL) as resp:
        trips = build(zipfile.ZipFile(io.BytesIO(resp.read())))
    assert trips and all(t['s'][-1][2] > 0 for t in trips), 'empty or zero-length trips'
    with open('tj.json', 'w') as out:
        json.dump(trips, out, separators=(',', ':'))
    print(len(trips), 'trips written to tj.json')
