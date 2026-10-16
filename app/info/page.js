import news from "../../public/announcements.json";
import Tabs from "../Tabs";

export const metadata = { title: "Info Transum" };
export const revalidate = 600; // re-fetch the news feed at most every 10 min

const FEED =
  "https://news.google.com/rss/search?hl=id&gl=ID&ceid=ID:id&q=" +
  encodeURIComponent('(gangguan OR rekayasa OR dibatalkan OR terlambat OR penyesuaian OR pengalihan) (KRL OR "Commuter Line" OR Transjakarta) when:3d');

const decode = (s) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&(amp|lt|gt|quot|#39|apos);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" })[e]);
const tag = (xml, t) => decode(xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");

// Google News RSS items -> [{title, link, source, date}]. Links are external data: keep http(s) only.
function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, it]) => {
      const source = tag(it, "source"),
        link = tag(it, "link");
      // Google appends " - <publisher>"; some publishers already end their own title with it too.
      const pub = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return {
        title: tag(it, "title").replace(new RegExp(`( - ${pub})+$`, "i"), ""),
        link: /^https?:\/\//.test(link) ? link : null,
        source,
        date: new Date(tag(it, "pubDate")),
      };
    })
    .filter((n) => n.title)
    .sort((a, b) => b.date - a.date); // feed comes in relevance order; newest first reads better
}
const sample = parseRss(
  '<item><title>KRL &amp; Bus - detikNews</title><link>javascript:alert(1)</link><pubDate>Fri, 16 Oct 2026 01:01:36 GMT</pubDate><source url="x">detikNews</source></item>',
);
console.assert(sample[0].title === "KRL & Bus" && sample[0].link === null && sample[0].source === "detikNews");
console.assert(parseRss("<item><title>A - B - kumparan.com - Kumparan.com</title><source>Kumparan.com</source></item>")[0].title === "A - B");

const when = (d) =>
  d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Info() {
  const feed = await fetch(FEED, { next: { revalidate } })
    .then((r) => (r.ok ? r.text() : ""))
    .then((x) => parseRss(x).slice(0, 20))
    .catch(() => null);

  return (
    <main className="krl">
      <header className="top">
        <div className="brand">Transumku</div>
        <Tabs on="/info" />
      </header>

      {/* Manual announcements: edit public/announcements.json (newest first) and redeploy.
          [{"id": "2026-10-17-krl", "type": "Gangguan", "date": "17 Okt 2026", "title": "...", "body": "..."}] */}
      {news.length > 0 && (
        <>
          <h1 className="label info-head">Pengumuman</h1>
          <div className="deps">
            {news.map((a) => (
              <article key={a.id} className="card">
                <span className="label kind">
                  {a.type ?? "Pengumuman"}
                  {a.date && <span className="mute"> · {a.date}</span>}
                </span>
                <h4>{a.title}</h4>
                {a.body && <p className="info-body">{a.body}</p>}
              </article>
            ))}
          </div>
        </>
      )}

      <h2 className="label info-head">Berita gangguan & layanan · 3 hari terakhir</h2>
      <div className="deps">
        {feed?.map((n) => (
          <article key={n.link ?? n.title} className="card">
            <span className="label kind">
              {n.source}
              <span className="mute"> · {when(n.date)}</span>
            </span>
            <h4>
              {n.link ? (
                <a href={n.link} target="_blank" rel="noopener noreferrer">
                  {n.title}
                </a>
              ) : (
                n.title
              )}
            </h4>
          </article>
        ))}
        {feed?.length === 0 && <p className="empty mute">Tidak ada berita gangguan 3 hari terakhir.</p>}
        {!feed && <p className="empty mute">Berita tidak bisa dimuat sekarang. Coba lagi nanti.</p>}
      </div>
      <footer className="mute">Berita dari Google News (media, bukan pengumuman resmi).</footer>
    </main>
  );
}
