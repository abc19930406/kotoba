interface AboutPageProps {
  onBack: () => void
}

export function AboutPage({ onBack }: AboutPageProps) {
  return (
    <div className="vocab-detail about-page">
      <button type="button" className="vocab-detail-back" onClick={onBack}>
        ← 首頁
      </button>

      <h1 className="about-title">關於</h1>
      <p className="about-intro">
        kotoba 是個人使用的日文學習 App，內容資料來自以下開源／創用 CC 授權專案，在此完整標註來源與授權：
      </p>

      <section className="about-source">
        <h2>JLPT 單字 N5–N1</h2>
        <p>
          來源：
          <a href="https://github.com/jamsinclair/open-anki-jlpt-decks" target="_blank" rel="noreferrer">
            jamsinclair/open-anki-jlpt-decks
          </a>
        </p>
      </section>

      <section className="about-source">
        <h2>日英例句</h2>
        <p>
          來源：
          <a href="https://github.com/mwhirls/tatoeba-json" target="_blank" rel="noreferrer">
            mwhirls/tatoeba-json
          </a>
          ，依 CC BY 2.0 FR 授權使用，例句版權屬{' '}
          <a href="https://tatoeba.org" target="_blank" rel="noreferrer">
            Tatoeba
          </a>{' '}
          專案。
        </p>
      </section>

      <section className="about-source">
        <h2>文法點內容</h2>
        <p>
          文法內容取自{' '}
          <a href="https://hanabira.org" target="_blank" rel="noreferrer">
            hanabira.org
          </a>
          （
          <a href="https://github.com/tristcoil/hanabira.org-japanese-content" target="_blank" rel="noreferrer">
            tristcoil/hanabira.org-japanese-content
          </a>
          ），依 Creative Commons 授權使用（來源標示為 CC ShareAlike，本專案從嚴依 CC BY-SA 4.0
          對待）。本專案為個人非商業用途。
        </p>
      </section>

      <section className="about-source">
        <h2>字典補充</h2>
        <p>
          來源：
          <a href="https://github.com/scriptin/jmdict-simplified" target="_blank" rel="noreferrer">
            scriptin/jmdict-simplified
          </a>
          ，依 CC BY-SA 授權使用，字典資料屬{' '}
          <a href="https://www.edrdg.org/jmdict/j_jmdict.html" target="_blank" rel="noreferrer">
            JMdict/EDRDG
          </a>
          。
        </p>
      </section>
    </div>
  )
}
