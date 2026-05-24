# FAPO Polska - Deploy (Netlify / Vercel)

## 1) Struktura projektu
- `index.html` - wersja PL
- `en.html` - wersja EN
- `sklep.html` - sklep / katalog
- `styles.css` - style
- `app.js` - animacje, katalog, koszyk i formularze
- `produkty/` - generowane lokalne podstrony produktow FAPO Polska
- `tools/prepare-product-pages.cjs` - przepisuje linki produktow na lokalne URL-e i generuje podstrony
- `tools/build-static.cjs` - buduje lekka paczke `dist` bez lokalnych kopii Shorts
- `api/contact.js` - endpoint formularzy Vercel
- `netlify/functions/contact.js` - endpoint formularzy Netlify
- `server/mail-handler.cjs` - wspolna logika wysylki SMTP
- `netlify.toml`, `_redirects`, `_headers` - konfiguracja Netlify
- `vercel.json` - konfiguracja Vercel

## 2) Szybki podglad lokalny (Windows PowerShell)
W katalogu projektu uruchom:

```powershell
cd "D:\Projekty\Projekt FAPO Polska"
python -m http.server 4173
```

Podglad statyczny:
- `http://localhost:4173/`
- `http://localhost:4173/en.html`
- `http://localhost:4173/sklep.html`

Uwaga: zwykly `python -m http.server` nie uruchamia endpointu `/api/contact`.
Formularze beda realnie wysylaly mail dopiero na Netlify/Vercel albo w lokalnym srodowisku funkcji serverless.

Przed wdrozeniem uruchom:

```powershell
npm run build
python -m http.server 4173 --directory dist
```

Deployuj katalog `dist`. Build kopiuje potrzebne pliki statyczne i pomija `assets/media/shorts`, bo strona odtwarza Shorts przez embed YouTube.

## 3) Kontrola katalogu
Po imporcie lub zmianie produktow uruchom:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
npm run catalog:enrich
npm run catalog:audit
npm run products:prepare
npm run import:sync-reports
```

`catalog:enrich` uzupelnia brakujace SKU i fitment z oficjalnych endpointow produktow FAPOMOTO, a `catalog:audit` sprawdza liczbe produktow, duplikaty ID, URL-e, SKU i roczniki/typ fitmentu.
`products:prepare` tworzy wlasne podstrony `produkty/*.html` i pilnuje, zeby widoczne linki produktow prowadzily na FAPO Polska, a nie do dystrybutora.
`import:sync-reports` odswieza lokalne raporty w `import/combined` i CSV na podstawie aktualnego `assets/data/products.json`.

## 4) Deploy na Netlify
1. Wrzuc projekt do repo albo podepnij folder przez Netlify.
2. Netlify odczyta `netlify.toml`, uruchomi `npm run build` i opublikuje `dist`.
3. Redirect `/api/contact` prowadzi do `/.netlify/functions/contact`.
4. Ustaw zmienne srodowiskowe SMTP z sekcji 6.

## 5) Deploy na Vercel
1. Wrzuc folder do repo (GitHub/GitLab/Bitbucket).
2. W Vercel kliknij `New Project` i wybierz repo.
3. Framework: `Other` / static.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Ustaw zmienne srodowiskowe SMTP z sekcji 6.

## 6) Przed publikacja produkcyjna
Sprawdz:
- dane formalne firmy,
- adres do doreczen,
- tresci regulaminowe / RODO,
- docelowy e-mail obslugi klienta,
- czy formularz kontaktowy wysyla testowa wiadomosc z produkcyjnego deploya,
- czy finalizacja zamowienia wysyla testowa wiadomosc z produkcyjnego deploya.

## 7) Wysylka formularzy
Formularz kontaktowy i finalizacja zamowienia wysylaja `POST /api/contact`.
Endpoint rozpoznaje zamowienia po polu `kind=order`, generuje numer zgloszenia i wysyla pelna zawartosc koszyka przez SMTP.
`mailto:` zostal tylko jako awaryjny fallback w przegladarce, gdy endpoint jest niedostepny.

Ustaw w panelu hostingu / deployu zmienne srodowiskowe:

```text
SMTP_HOST=poczta2651521.home.pl
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=info@fapomoto.pl
SMTP_PASS=<haslo skrzynki info@fapomoto.pl>
SMTP_FROM="FAPO Polska <info@fapomoto.pl>"
MAIL_TO=office@fapomoto.pl,piotr.modlinski@gmail.com
```

Nie zapisuj hasla SMTP w `app.js`, HTML ani repozytorium. Lokalny szablon jest w `.env.example`.
