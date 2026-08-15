import { BairroMap } from './map/BairroMap'
import styles from './App.module.css'

export default function App() {
  return (
    <main className={styles.app}>
      <BairroMap />
      <section
        className={styles.inputPlaceholder}
        aria-label="Área de palpites"
      >
        <span>Área de palpites</span>
      </section>
    </main>
  )
}
