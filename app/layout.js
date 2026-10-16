import { Nunito } from "next/font/google";
import "leaflet/dist/leaflet.css"; // before globals so our overrides win
import "./globals.css";

const font = Nunito({ subsets: ["latin"], variable: "--font" });

export const metadata = {
  title: "Transumku",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Transumku" },
};
export const viewport = { themeColor: "#f6f3fb" };

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={font.variable}>
      <body>
        {/* Layout never remounts on client navigation, so this only plays on first load. */}
        <div className="splash" aria-hidden="true"><div className="brand">Transumku</div></div>
        {children}
      </body>
    </html>
  );
}
