import { ImageResponse } from 'next/og';

// Brand mark: lavender square on the pastel background (same as .brand::before).
export const mark = s => (
  <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f3fb'}}>
    <div style={{width: s * .42, height: s * .42, borderRadius: s * .12, background: '#7b61d1', boxShadow: `0 ${s * .03}px ${s * .1}px rgba(123, 97, 209, .35)`}} />
  </div>
);

export function generateImageMetadata() {
  return [192, 512].map(s => ({id: String(s), size: {width: s, height: s}, contentType: 'image/png'}));
}

export default async function Icon({ id }) {
  const s = +(await id);
  return new ImageResponse(mark(s), {width: s, height: s});
}
