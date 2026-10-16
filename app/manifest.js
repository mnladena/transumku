export default function manifest() {
  return {
    name: 'Transumku',
    short_name: 'Transumku',
    description: 'Posisi KRL dan peta TransJakarta, langsung dari jadwal.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0f1d',
    theme_color: '#0a0f1d',
    icons: [192, 512].map(s => ({src: `/icon/${s}`, sizes: `${s}x${s}`, type: 'image/png'})),
  };
}
