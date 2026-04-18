# FAPO Polska - Deploy (Netlify / Vercel)

## 1) Struktura projektu
- `index.html` - wersja PL
- `en.html` - wersja EN
- `styles.css` - style
- `app.js` - animacje/form
- `netlify.toml`, `_redirects`, `_headers` - konfiguracja Netlify
- `vercel.json` - konfiguracja Vercel

## 2) Szybki podgląd lokalny (Windows PowerShell)
W katalogu projektu uruchom:

```powershell
cd "D:\Projekty\Projekt FAPO Polska"
python -m http.server 4173
```

Podgląd:
- `http://localhost:4173/`
- `http://localhost:4173/en.html`

## 3) Deploy na Netlify (najprościej)
1. Wejdź na Netlify i kliknij `Add new site` -> `Deploy manually`.
2. Przeciągnij cały folder `D:\Projekty\Projekt FAPO Polska`.
3. Gotowe. Redirecty `/pl` i `/en` zadziałają automatycznie.

## 4) Deploy na Vercel
1. Wrzuć folder do repo (GitHub/GitLab/Bitbucket).
2. W Vercel kliknij `New Project` i wybierz repo.
3. Framework: `Other` / static.
4. Build command: puste.
5. Output directory: `.` (kropka).
6. Deploy.

## 5) Przed publikacją produkcyjną
Uzupełnij placeholdery w `index.html` i `en.html`:
- `[NAZWA SPÓŁKI / JDG]`
- `[FORMA PRAWNA]`
- `NIP/REGON/KRS/CEIDG`
- `Adres siedziby`
- `E-mail PL / telefon`

## 6) Rekomendacja
Do formularza kontaktowego dodaj backend (np. Formspree, Netlify Forms, własne API), bo obecnie działa jako front-end demo.

