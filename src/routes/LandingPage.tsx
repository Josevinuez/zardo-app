import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./styles/landing.module.css";

export function LandingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const showForm = true;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("host")) {
      navigate("/app", { replace: true });
    }
  }, [location.search, navigate]);

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Zardo Cards Master Panel</h1>
        <p className={styles.text}>
          Manage PSA imports, automate inventory checks, and keep your Shopify store in sync.
        </p>
        {showForm && (
          <form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" placeholder="my-shop.myshopify.com" />
              <span>Use the *.myshopify.com domain</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Automated inventory controls.</strong> Draft products when inventory hits zero and keep arrivals collections fresh.
          </li>
          <li>
            <strong>End-to-end PSA workflows.</strong> Import, validate, and publish graded cards with media processing and pricing logic.
          </li>
          <li>
            <strong>Customer engagement.</strong> Wishlist automation, VIP tracking, and targeted notifications built-in.
          </li>
        </ul>
      </div>
    </div>
  );
}
