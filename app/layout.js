import { Big_Shoulders, Public_Sans } from "next/font/google";
import "leaflet/dist/leaflet.css"; // before globals so our overrides win
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-display",
  adjustFontFallback: false,
});
const body = Public_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata = {
  title: "Transumku",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Transumku" },
};
export const viewport = { themeColor: "#0a0f1d" };

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable}`}>
      <body>
        {/* Layout never remounts on client navigation, so this only plays on first load. */}
        <div className="splash" aria-hidden="true"><div className="brand">Transumku</div></div>
        {children}
      </body>
    </html>
  );
}
