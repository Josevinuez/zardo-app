import { NavLink, Outlet } from "react-router-dom";
import styles from "./AppLayout.module.css";

const navLinks = [
  { to: ".", label: "Dashboard", end: true },
  { to: "trolltoad", label: "Troll & Toad" },
  { to: "psa", label: "PSA Import" },
  { to: "manual", label: "Manual Products" },
  { to: "psahistory", label: "PSA History" },
  { to: "keyword/manage", label: "Wishlist Keywords" },
  { to: "keyword/stats", label: "Wishlist Analytics" },
  { to: "lots", label: "Lot Tracking" },
  { to: "internal/settings", label: "Settings" },
];

export function AppLayout() {
  return (
    <div className={styles.frame}>
      <nav className={styles.navbar}>
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              [styles.navLink, isActive ? styles.navLinkActive : null]
                .filter(Boolean)
                .join(" ")
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
