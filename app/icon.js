import { ImageResponse } from 'next/og';

// Brand mark: glowing amber square on the night background (same as .brand::before).
export const mark = s => (
  <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0f1d'}}>
    <div style={{width: s * .42, height: s * .42, borderRadius: s * .1, background: '#ffb81c', boxShadow: `0 0 ${s * .15}px rgba(255, 184, 28, .55)`}} />
  </div>
);

export function generateImageMetadata() {
  return [192, 512].map(s => ({id: String(s), size: {width: s, height: s}, contentType: 'image/png'}));
}

export default async function Icon({ id }) {
  const s = +(await id);
  return new ImageResponse(mark(s), {width: s, height: s});
}
