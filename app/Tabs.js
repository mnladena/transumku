import Link from "next/link";
import { BUS, Ico, INFO, TRAIN } from "./icons";

const TABS = [
  ["/", TRAIN, "KRL"],
  ["/tj", BUS, "TransJakarta"],
  ["/info", INFO, "Info"],
];

export default function Tabs({ on }) {
  return (
    <nav className="tabs">
      {TABS.map(([href, svg, label]) => (
        <Link key={href} href={href} className={href === on ? "on" : undefined}>
          <Ico svg={svg} /> {label}
        </Link>
      ))}
    </nav>
  );
}
